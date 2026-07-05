import type { Request, Response, NextFunction } from 'express'
import { pool } from '@/config/database.js'
import type { JwtPayload } from '../../types/express-override.js'

export async function tenantMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  if ((req.user as JwtPayload)) {
    req.tenantId = (req.user as JwtPayload).tenantId
    try {
      const r = await pool.query<{ expires_at: string | null; is_active: boolean }>(
        'SELECT expires_at, is_active FROM tenants WHERE id = $1',
        [(req.user as JwtPayload).tenantId],
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
      // DB hatası → fail-closed (audit/billing enforcement atlanmasın)
      res.status(503).json({
        success: false,
        code: 'TENANT_LOOKUP_FAILED',
        message: 'Tenant doğrulaması geçici olarak başarısız, lütfen tekrar deneyin',
      })
      return
    }
  }
  next()
}
