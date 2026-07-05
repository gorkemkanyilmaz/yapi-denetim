import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { pool } from '@/config/database.js'
import { UserRole } from '@shared/types/enums'
import { logger } from '@/utils/logger.js'
import type { JwtPayload } from '../../types/express-override.js'

export type { JwtPayload }

// Boot-time assertion: fail fast if JWT_SECRET is missing or too weak.
const _jwtSecret = process.env.JWT_SECRET
if (!_jwtSecret || _jwtSecret.length < 32 || _jwtSecret === 'change-me') {
  logger.error('JWT_SECRET eksik veya zayıf (en az 32 karakter). Çıkılıyor.')
  throw new Error('JWT_SECRET is required and must be at least 32 characters (no default "change-me" allowed)')
}
const JWT_SECRET: string = _jwtSecret

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as never })
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Yetkilendirme gerekli' })
    return
  }
  let payload: JwtPayload
  try {
    const token = header.slice(7)
    payload = verifyToken(token)
  } catch {
    res.status(401).json({ success: false, message: 'Geçersiz veya süresi dolmuş token' })
    return
  }
  // DB recheck: kullanıcı pasif mi, rolü değişmiş mi, tenant aktif mi?
  // Hata durumunda next() çağrılmaz; fail-closed.
  revalidateSession(payload)
    .then((fresh) => {
      if (!fresh) {
        res.status(401).json({ success: false, message: 'Oturum geçersiz (kullanıcı pasif veya rol değişmiş)' })
        return
      }
      req.user = payload
      next()
    })
    .catch((err) => {
      logger.error('session revalidate failed', { err: err instanceof Error ? { message: err.message } : err })
      res.status(503).json({ success: false, code: 'SESSION_CHECK_FAILED', message: 'Oturum doğrulaması geçici olarak başarısız' })
    })
}

async function revalidateSession(payload: JwtPayload): Promise<boolean> {
  const r = await pool.query<{ is_active: boolean; role: UserRole; tenant_is_active: boolean; tenant_expires_at: string | null }>(
    `SELECT u.is_active, u.role, t.is_active AS tenant_is_active, t.expires_at AS tenant_expires_at
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
      WHERE u.id = $1 AND u.tenant_id = $2`,
    [payload.userId, payload.tenantId],
  )
  const row = r.rows[0]
  if (!row || !row.is_active || !row.tenant_is_active) return false
  if (row.tenant_expires_at && new Date(row.tenant_expires_at) < new Date()) return false
  // Token'daki rol ile DB'deki rol farklıysa → geçersiz
  if (row.role !== payload.role) return false
  return true
}

export function requireRole(...allowed: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Yetkilendirme gerekli' })
      return
    }
    if (!allowed.includes(req.user.role)) {
      res.status(403).json({ success: false, message: 'Bu işlem için yetkiniz yok' })
      return
    }
    next()
  }
}

export function loadTenantUser(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next()
    return
  }
  req.tenantId = req.user.tenantId
  next()
}

export async function ensureUserActive(userId: string): Promise<boolean> {
  const r = await pool.query<{ is_active: boolean }>(
    `SELECT is_active FROM users WHERE id = $1`,
    [userId],
  )
  return r.rows[0]?.is_active ?? false
}
