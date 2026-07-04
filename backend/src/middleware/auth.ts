import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { pool } from '@/config/database.js'
import { UserRole } from '@shared/types/enums'

export interface JwtPayload {
  userId: string
  tenantId: string
  role: UserRole
  email: string
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
      tenantId?: string
    }
  }
}

export function signToken(payload: JwtPayload): string {
  const secret = process.env.JWT_SECRET ?? 'change-me'
  return jwt.sign(payload, secret, { expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as never })
}

export function verifyToken(token: string): JwtPayload {
  const secret = process.env.JWT_SECRET ?? 'change-me'
  return jwt.verify(token, secret) as JwtPayload
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Yetkilendirme gerekli' })
    return
  }
  try {
    const token = header.slice(7)
    const payload = verifyToken(token)
    req.user = payload
    next()
  } catch {
    res.status(401).json({ success: false, message: 'Geçersiz veya süresi dolmuş token' })
  }
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
