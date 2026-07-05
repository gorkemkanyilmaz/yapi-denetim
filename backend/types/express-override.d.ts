// Express 5 Request.user type'ını override et.
// @types/express'te user: string | string[] union'ı var; bunu JwtPayload ile değiştir.

import type { UserRole } from '../shared/types/enums.js'

export interface JwtPayload {
  userId: string
  tenantId: string
  role: UserRole
  email: string
}

declare global {
  namespace Express {
    interface Request {
      user: JwtPayload | undefined
      tenantId: string | undefined
      tenantExpiresAt: string | null | undefined
    }
  }
}

export {}
