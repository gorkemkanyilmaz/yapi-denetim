import type { Request, Response } from 'express'
import { pool } from '@/config/database.js'
import bcrypt from 'bcryptjs'
import { signToken } from '@/middleware/auth.js'
import { recordAudit } from '@/utils/audit.js'
import { logger } from '@/utils/logger.js'
import { UserRole } from '@shared/types/enums'
import type { JwtPayload } from '@/middleware/auth.js'

// Rol hiyerarşisi: üst sıradaki rol daha yüksek yetki
const ROLE_HIERARCHY: Record<string, number> = {
  [UserRole.FIELD_TECH]: 1,
  [UserRole.COURIER]: 1,
  [UserRole.LAB_TECHNICIAN]: 2,
  [UserRole.QC_ENGINEER]: 3,
  [UserRole.MANAGER]: 4,
  [UserRole.OWNER]: 5,
  [UserRole.ADMIN]: 6,
}
const VALID_ROLES = Object.values(UserRole)

function canManage(callerRole: string, targetRole: string): boolean {
  return (ROLE_HIERARCHY[callerRole] ?? 0) >= (ROLE_HIERARCHY[targetRole] ?? 0)
}

const PASSWORD_MIN_LENGTH = 8
const WEAK_PASSWORDS = new Set(['password', 'password123', '12345678', '123456789', 'qwerty', 'qwerty123', '11111111', '00000000', 'admin123'])

function isWeakPassword(pw: string): boolean {
  if (pw.length < PASSWORD_MIN_LENGTH) return true
  if (WEAK_PASSWORDS.has(pw.toLowerCase())) return true
  if (!/[A-Z]/.test(pw)) return true
  if (!/[a-z]/.test(pw)) return true
  if (!/[0-9]/.test(pw)) return true
  return false
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password, tenantSlug } = req.body as { email: string; password: string; tenantSlug?: string }
  if (!email || !password) {
    res.status(400).json({ success: false, message: 'E-posta ve şifre zorunlu' })
    return
  }
  const tenantFilter = tenantSlug ? `AND t.slug = $2` : ''
  const params: unknown[] = [email.toLowerCase().trim()]
  if (tenantSlug) params.push(tenantSlug)
  const r = await pool.query<{
    id: string; tenant_id: string; password_hash: string; full_name: string;
    role: string; is_active: boolean; email: string; tenant_name: string; tenant_slug: string;
    tenant_is_active: boolean; tenant_expires_at: string | null;
  }>(
    `SELECT u.id, u.tenant_id, u.password_hash, u.full_name, u.role, u.is_active, u.email,
            t.name AS tenant_name, t.slug AS tenant_slug,
            t.is_active AS tenant_is_active, t.expires_at AS tenant_expires_at
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
      WHERE u.email = $1 ${tenantFilter}
      LIMIT 1`,
    params,
  )
  const user = r.rows[0]
  // Timing oracle engeli: kullanıcı yoksa bile bcrypt karşılaştırması yap
  const DUMMY_HASH = '$2a$12$0000000000000000000000.0000000000000000000000000000000000000'
  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH)
  if (!user || !user.is_active) {
    res.status(401).json({ success: false, message: 'Geçersiz kimlik bilgileri' })
    return
  }
  if (!ok) {
    res.status(401).json({ success: false, message: 'Geçersiz kimlik bilgileri' })
    return
  }
  if (user.tenant_is_active === false) {
    res.status(403).json({ success: false, code: 'TENANT_DISABLED', message: 'Firma hesabı devre dışı bırakılmıştır' })
    return
  }
  if (user.tenant_expires_at && new Date(user.tenant_expires_at) < new Date()) {
    res.status(403).json({
      success: false,
      code: 'TENANT_EXPIRED',
      message: 'Firma kullanım süresi dolmuştur. Yönetici ile iletişime geçin.',
      expiresAt: user.tenant_expires_at,
    })
    return
  }
  const token = signToken({
    userId: user.id,
    tenantId: user.tenant_id,
    role: user.role as never,
    email: user.email,
  })
  await pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id])
  res.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id, email: user.email, full_name: user.full_name,
        role: user.role, tenant_id: user.tenant_id,
      },
      tenant: {
        id: user.tenant_id,
        name: user.tenant_name,
        slug: user.tenant_slug,
        expires_at: user.tenant_expires_at,
      },
    },
  })
}

export async function register(req: Request, res: Response): Promise<void> {
  const { tenantName, tenantSlug, adminEmail, adminPassword, adminFullName } = req.body as {
    tenantName: string; tenantSlug: string; adminEmail: string; adminPassword: string; adminFullName: string
  }
  if (!tenantName || !tenantSlug || !adminEmail || !adminPassword || !adminFullName) {
    res.status(400).json({ success: false, message: 'Tüm alanlar zorunlu' })
    return
  }
  if (!/^[a-z0-9][a-z0-9-]{2,30}$/.test(tenantSlug)) {
    res.status(400).json({ success: false, message: 'Geçersiz tenantSlug (küçük harf, rakam, tire)' })
    return
  }
  if (isWeakPassword(adminPassword)) {
    res.status(400).json({ success: false, message: `Şifre en az ${PASSWORD_MIN_LENGTH} karakter, büyük harf, küçük harf ve rakam içermeli` })
    return
  }
  const hash = await bcrypt.hash(adminPassword, 12)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const t = await client.query<{ id: string }>(
      `INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id`,
      [tenantName, tenantSlug],
    )
    const tenantId = t.rows[0].id
    const u = await client.query<{ id: string }>(
      `INSERT INTO users (tenant_id, email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4, 'owner') RETURNING id`,
      [tenantId, adminEmail.toLowerCase().trim(), hash, adminFullName.trim()],
    )
    await recordAudit(client, {
      tenantId, userId: u.rows[0].id, entityType: 'tenant', entityId: tenantId,
      action: 'INSERT', ipAddress: req.ip ?? '0.0.0.0', userAgent: req.headers['user-agent'] ?? '',
    })
    await client.query('COMMIT')
    const token = signToken({ userId: u.rows[0].id, tenantId, role: 'owner' as never, email: adminEmail })
    res.status(201).json({ success: true, data: { token, tenantId } })
  } catch (err) {
    await client.query('ROLLBACK')
    const code = (err as { code?: string }).code
    logger.error('register failed', { err: err instanceof Error ? { message: err.message, code } : err })
    if (code === '23505') {
      res.status(409).json({ success: false, message: 'Bu tenant slug veya e-posta zaten kullanımda' })
    } else {
      res.status(500).json({ success: false, message: 'Kayıt oluşturulamadı' })
    }
  } finally {
    client.release()
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!(req.user as JwtPayload)) {
    res.status(401).json({ success: false, message: 'Yetkilendirme gerekli' })
    return
  }
  const r = await pool.query(
    `SELECT u.id, u.email, u.full_name, u.role, u.phone, u.avatar_url, u.tenant_id,
            t.name AS tenant_name, t.slug AS tenant_slug, t.logo_url, t.expires_at AS tenant_expires_at
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
      WHERE u.id = $1`,
    [(req.user as JwtPayload).userId],
  )
  const row = r.rows[0]
  if (!row) {
    res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' })
    return
  }
  res.json({
    success: true,
    data: {
      ...row,
      tenant: {
        id: row.tenant_id,
        name: row.tenant_name,
        slug: row.tenant_slug,
        logo_url: row.logo_url,
        expires_at: row.tenant_expires_at,
      },
    },
  })
}

export async function listUsers(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) {
    res.status(400).json({ success: false, message: 'Tenant gerekli' })
    return
  }
  // Sadece yönetici roller görebilir (KVKK / privacy)
  if (req.user?.role !== UserRole.OWNER && req.user?.role !== UserRole.MANAGER && req.user?.role !== UserRole.ADMIN) {
    res.status(403).json({ success: false, message: 'Bu listeyi görme yetkiniz yok' })
    return
  }
  const r = await pool.query(
    `SELECT u.id, u.email, u.full_name, u.role, u.phone, u.is_active,
            (SELECT COUNT(*)::int FROM sample_sets WHERE assigned_to = u.id AND status IN ('approved','archived')) AS completed_count,
            (SELECT COUNT(*)::int FROM sample_sets WHERE assigned_to = u.id AND status NOT IN ('approved','archived')) AS active_count
       FROM users u
      WHERE u.tenant_id = $1
      ORDER BY u.full_name`,
    [req.tenantId],
  )
  res.json({ success: true, data: r.rows })
}

async function assertCanModifyUser(_callerUserId: string, callerRole: string, callerTenantId: string, targetId: string): Promise<{ ok: boolean; reason?: string; targetRole?: string; targetActive?: boolean }> {
  const t = await pool.query<{ role: string; is_active: boolean }>(
    `SELECT role, is_active FROM users WHERE id = $1 AND tenant_id = $2`,
    [targetId, callerTenantId]
  )
  if (!t.rows[0]) return { ok: false, reason: 'Kullanıcı bulunamadı' }
  if (t.rows[0].role === UserRole.OWNER && callerRole !== UserRole.OWNER) {
    return { ok: false, reason: 'Sadece patron owner kullanıcıyı değiştirebilir' }
  }
  return { ok: true, targetRole: t.rows[0].role, targetActive: t.rows[0].is_active }
}

async function countActiveOwners(tenantId: string, excludeUserId?: string): Promise<number> {
  const params: unknown[] = [tenantId]
  let where = "WHERE tenant_id = $1 AND role = 'owner' AND is_active = true"
  if (excludeUserId) { params.push(excludeUserId); where += ` AND id <> $${params.length}` }
  const r = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM users ${where}`, params)
  return Number(r.rows[0]?.count ?? 0)
}

export async function createUser(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false, message: 'Tenant gerekli' }); return }
  if (req.user?.role !== UserRole.OWNER && req.user?.role !== UserRole.MANAGER && req.user?.role !== UserRole.ADMIN) {
    res.status(403).json({ success: false, message: 'Yönetici yetkisi gerekli' })
    return
  }

  const { email, fullName, role, phone, password } = req.body as {
    email: string; fullName: string; role: string; phone?: string; password?: string
  }

  if (!email || !fullName || !role || !password) {
    res.status(400).json({ success: false, message: 'E-posta, Ad Soyad, Rol ve Şifre zorunludur' })
    return
  }
  if (!VALID_ROLES.includes(role as never)) {
    res.status(400).json({ success: false, message: 'Geçersiz rol' })
    return
  }
  if (isWeakPassword(password)) {
    res.status(400).json({ success: false, message: `Şifre en az ${PASSWORD_MIN_LENGTH} karakter, büyük harf, küçük harf ve rakam içermeli` })
    return
  }
  // Sadece owner, owner rolü atayabilir
  if (role === UserRole.OWNER && (req.user as JwtPayload).role !== UserRole.OWNER) {
    res.status(403).json({ success: false, message: 'Sadece patron yeni patron atayabilir' })
    return
  }
  if (!canManage((req.user as JwtPayload).role, role)) {
    res.status(403).json({ success: false, message: 'Bu rolü atama yetkiniz yok' })
    return
  }

  try {
    const hash = await bcrypt.hash(password, 12)
    const r = await pool.query(
      `INSERT INTO users (tenant_id, email, password_hash, full_name, role, phone)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, role, full_name, phone`,
      [req.tenantId, email.toLowerCase().trim(), hash, fullName.trim(), role, phone || null]
    )
    const client = await pool.connect()
    try {
      await recordAudit(client, {
        tenantId: req.tenantId, userId: (req.user as JwtPayload).userId, entityType: 'user', entityId: r.rows[0].id,
        action: 'INSERT', fieldName: 'role', newValue: role,
        ipAddress: req.ip ?? '0.0.0.0', userAgent: req.headers['user-agent'] ?? '',
      })
    } finally { client.release() }
    res.status(201).json({ success: true, data: r.rows[0] })
  } catch (err) {
    const code = (err as { code?: string }).code
    logger.error('createUser failed', { err: err instanceof Error ? { message: err.message, code } : err })
    if (code === '23505') {
      res.status(409).json({ success: false, message: 'E-posta zaten kullanımda' })
    } else {
      res.status(500).json({ success: false, message: 'Kullanıcı oluşturulamadı' })
    }
  }
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false, message: 'Tenant gerekli' }); return }
  if (req.user?.role !== UserRole.OWNER && req.user?.role !== UserRole.MANAGER && req.user?.role !== UserRole.ADMIN) {
    res.status(403).json({ success: false, message: 'Yönetici yetkisi gerekli' })
    return
  }

  const id = req.params.id as string
  const { fullName, role, phone, isActive, password } = req.body as {
    fullName: string; role: string; phone?: string; isActive: boolean; password?: string
  }

  if (!fullName || !role) {
    res.status(400).json({ success: false, message: 'Ad Soyad ve Rol zorunludur' })
    return
  }
  if (!VALID_ROLES.includes(role as never)) {
    res.status(400).json({ success: false, message: 'Geçersiz rol' })
    return
  }
  const perm = await assertCanModifyUser((req.user as JwtPayload).userId, (req.user as JwtPayload).role, req.tenantId, id)
  if (!perm.ok) {
    res.status(403).json({ success: false, message: perm.reason })
    return
  }
  if (!canManage((req.user as JwtPayload).role, role)) {
    res.status(403).json({ success: false, message: 'Bu rolü atama yetkiniz yok' })
    return
  }
  if (id === (req.user as JwtPayload).userId && isActive === false) {
    res.status(400).json({ success: false, message: 'Kendinizi pasifleştiremezsiniz' })
    return
  }
  if (perm.targetRole === UserRole.OWNER && (role !== UserRole.OWNER || isActive === false)) {
    const remaining = await countActiveOwners(req.tenantId, id)
    if (remaining === 0) {
      res.status(400).json({ success: false, message: 'Son aktif patron değiştirilemez/pasifleştirilemez' })
      return
    }
  }
  if (password && isWeakPassword(password)) {
    res.status(400).json({ success: false, message: `Şifre en az ${PASSWORD_MIN_LENGTH} karakter, büyük harf, küçük harf ve rakam içermeli` })
    return
  }

  try {
    const fields: string[] = ['full_name = $1', 'role = $2', 'phone = $3', 'is_active = $4', 'updated_at = NOW()']
    const values: unknown[] = [fullName.trim(), role, phone || null, isActive]
    if (password && password.trim() !== '') {
      const hash = await bcrypt.hash(password, 12)
      fields.push(`password_hash = $${values.length + 1}`)
      values.push(hash)
    }
    values.push(id, req.tenantId)
    const r = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${values.length - 1} AND tenant_id = $${values.length} RETURNING id, role, is_active`,
      values
    )
    if (r.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' })
      return
    }
    const client = await pool.connect()
    try {
      await recordAudit(client, {
        tenantId: req.tenantId, userId: (req.user as JwtPayload).userId, entityType: 'user', entityId: id,
        action: 'UPDATE', fieldName: 'role,is_active',
        oldValue: `${perm.targetRole},${perm.targetActive}`, newValue: `${role},${isActive}`,
        ipAddress: req.ip ?? '0.0.0.0', userAgent: req.headers['user-agent'] ?? '',
      })
    } finally { client.release() }
    res.json({ success: true })
  } catch (err) {
    logger.error('updateUser failed', { err: err instanceof Error ? { message: err.message, code: (err as { code?: string }).code } : err })
    res.status(500).json({ success: false, message: 'Kullanıcı güncellenemedi' })
  }
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false, message: 'Tenant gerekli' }); return }
  if (req.user?.role !== UserRole.OWNER && req.user?.role !== UserRole.MANAGER && req.user?.role !== UserRole.ADMIN) {
    res.status(403).json({ success: false, message: 'Yönetici yetkisi gerekli' })
    return
  }

  const id = req.params.id as string
  if (id === (req.user as JwtPayload).userId) {
    res.status(400).json({ success: false, message: 'Kendinizi silemezsiniz' })
    return
  }
  const perm = await assertCanModifyUser((req.user as JwtPayload).userId, (req.user as JwtPayload).role, req.tenantId, id)
  if (!perm.ok) {
    res.status(403).json({ success: false, message: perm.reason })
    return
  }
  if (perm.targetRole === UserRole.OWNER && perm.targetActive) {
    const remaining = await countActiveOwners(req.tenantId, id)
    if (remaining === 0) {
      res.status(400).json({ success: false, message: 'Son aktif patron silinemez' })
      return
    }
  }
  // Soft delete: hard DELETE FK RESTRICT yüzünden başarısız olur
  await pool.query(
    `UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
    [id, req.tenantId]
  )
  res.json({ success: true, message: 'Kullanıcı pasifleştirildi' })
}
