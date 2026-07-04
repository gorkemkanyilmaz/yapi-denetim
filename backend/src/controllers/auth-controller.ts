import type { Request, Response } from 'express'
import { pool } from '@/config/database.js'
import bcrypt from 'bcryptjs'
import { signToken } from '@/middleware/auth.js'
import { recordAudit } from '@/utils/audit.js'
import { logger } from '@/utils/logger.js'

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password, tenantSlug } = req.body as { email: string; password: string; tenantSlug?: string }
  if (!email || !password) {
    res.status(400).json({ success: false, message: 'E-posta ve şifre zorunlu' })
    return
  }
  const tenantFilter = tenantSlug ? `AND t.slug = $2` : ''
  const params: unknown[] = [email]
  if (tenantSlug) params.push(tenantSlug)
  const r = await pool.query<{
    id: string; tenant_id: string; password_hash: string; full_name: string;
    role: string; is_active: boolean; email: string; tenant_name: string; tenant_slug: string;
  }>(
    `SELECT u.id, u.tenant_id, u.password_hash, u.full_name, u.role, u.is_active, u.email,
            t.name AS tenant_name, t.slug AS tenant_slug
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
      WHERE u.email = $1 ${tenantFilter}
      LIMIT 1`,
    params,
  )
  const user = r.rows[0]
  if (!user || !user.is_active) {
    res.status(401).json({ success: false, message: 'Geçersiz kimlik bilgileri' })
    return
  }
  const ok = await bcrypt.compare(password, user.password_hash)
  if (!ok) {
    res.status(401).json({ success: false, message: 'Geçersiz kimlik bilgileri' })
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
      tenant: { id: user.tenant_id, name: user.tenant_name, slug: user.tenant_slug },
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
      [tenantId, adminEmail, hash, adminFullName],
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
    logger.error('register failed', { err })
    res.status(409).json({ success: false, message: 'Tenant slug veya e-posta kullanımda' })
  } finally {
    client.release()
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Yetkilendirme gerekli' })
    return
  }
  const r = await pool.query(
    `SELECT u.id, u.email, u.full_name, u.role, u.phone, u.avatar_url, u.tenant_id,
            t.name AS tenant_name, t.slug AS tenant_slug, t.logo_url
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
      WHERE u.id = $1`,
    [req.user.userId],
  )
  res.json({ success: true, data: r.rows[0] ?? null })
}

export async function listUsers(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) {
    res.status(400).json({ success: false, message: 'Tenant gerekli' })
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

export async function createUser(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false, message: 'Tenant gerekli' }); return }
  if (req.user?.role !== 'owner' && req.user?.role !== 'manager' && req.user?.role !== 'admin') {
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

  try {
    const hash = await bcrypt.hash(password, 12)
    const r = await pool.query(
      `INSERT INTO users (tenant_id, email, password_hash, full_name, role, phone)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, role, full_name, phone`,
      [req.tenantId, email.toLowerCase().trim(), hash, fullName.trim(), role, phone || null]
    )
    res.status(201).json({ success: true, data: r.rows[0] })
  } catch (err) {
    logger.error('createUser failed', { err })
    res.status(409).json({ success: false, message: 'E-posta zaten kullanımda' })
  }
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false, message: 'Tenant gerekli' }); return }
  if (req.user?.role !== 'owner' && req.user?.role !== 'manager' && req.user?.role !== 'admin') {
    res.status(403).json({ success: false, message: 'Yönetici yetkisi gerekli' })
    return
  }

  const { id } = req.params
  const { fullName, role, phone, isActive, password } = req.body as {
    fullName: string; role: string; phone?: string; isActive: boolean; password?: string
  }

  if (!fullName || !role) {
    res.status(400).json({ success: false, message: 'Ad Soyad ve Rol zorunludur' })
    return
  }

  try {
    if (password && password.trim() !== '') {
      const hash = await bcrypt.hash(password, 12)
      await pool.query(
        `UPDATE users
            SET full_name = $1, role = $2, phone = $3, is_active = $4, password_hash = $5, updated_at = NOW()
          WHERE id = $6 AND tenant_id = $7`,
        [fullName.trim(), role, phone || null, isActive, hash, id, req.tenantId]
      )
    } else {
      await pool.query(
        `UPDATE users
            SET full_name = $1, role = $2, phone = $3, is_active = $4, updated_at = NOW()
          WHERE id = $5 AND tenant_id = $6`,
        [fullName.trim(), role, phone || null, isActive, id, req.tenantId]
      )
    }
    res.json({ success: true })
  } catch (err) {
    logger.error('updateUser failed', { err })
    res.status(500).json({ success: false, message: 'Kullanıcı güncellenemedi' })
  }
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false, message: 'Tenant gerekli' }); return }
  if (req.user?.role !== 'owner' && req.user?.role !== 'manager' && req.user?.role !== 'admin') {
    res.status(403).json({ success: false, message: 'Yönetici yetkisi gerekli' })
    return
  }

  const { id } = req.params
  if (id === req.user.userId) {
    res.status(400).json({ success: false, message: 'Kendinizi silemezsiniz' })
    return
  }

  await pool.query(
    `DELETE FROM users WHERE id = $1 AND tenant_id = $2`,
    [id, req.tenantId]
  )
  res.json({ success: true, message: 'Kullanıcı başarıyla silindi' })
}
