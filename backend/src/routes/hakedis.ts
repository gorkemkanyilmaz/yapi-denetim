import { Router } from 'express'
import { authenticate, requireRole } from '@/middleware/auth.js'
import { UserRole } from '@shared/types/enums'
import * as ctrl from '@/controllers/hakedis-controller.js'

export const hakedisRouter = Router()
hakedisRouter.use(authenticate)

hakedisRouter.get('/', requireRole(UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN), ctrl.listHakedis)
hakedisRouter.post('/', requireRole(UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN), ctrl.createHakedis)
hakedisRouter.patch('/:id/status', requireRole(UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN), ctrl.updateHakedisStatus)
hakedisRouter.get('/:id/export', requireRole(UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN), ctrl.exportHakedis)
