import type { Request, Response, NextFunction } from 'express'

export function tenantMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (req.user) {
    req.tenantId = req.user.tenantId
  }
  next()
}
