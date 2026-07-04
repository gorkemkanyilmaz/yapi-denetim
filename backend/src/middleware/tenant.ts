import type { Request, Response, NextFunction } from 'express'
import { pool } from '@/config/database.js'

declare global {
  namespace Express {
    interface Request {
      tenantId?: string
      tenantExpiresAt?: string | null
    }
  }
}

export async function tenantMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.user) {
    req.tenantId = req.user.tenantId
    try {
      const r = await pool.query<{ expires_at: string | null; is_active: boolean }>(
        'SELECT expires_at, is_active FROM tenants WHERE id = $1',
        [req.user.tenantId],
      )
      const row = r.rows[0]
      if (row) {
        req.tenantExpiresAt = row.expires_at
        if (row.is_active === false) {
          res.status(403).json({
            success: false,
            code: 'TENANT_DISABLED',
            message: 'Firma hesabı devre dışı bırakılmıştır',
          })
          return
        }
        if (row.expires_at && new Date(row.expires_at) < new Date()) {
          res.status(403).json({
            success: false,
            code: 'TENANT_EXPIRED',
            message: 'Firma kullanım süresi dolmuştur. Yönetici ile iletişime geçin.',
            expiresAt: row.expires_at,
          })
          return
        }
      }
    } catch (err) {
      // DB hatası → sessizce geç, sonraki middleware'ler halledebilir
    }
  }
  next()
}
