import { Router } from 'express'
import { authenticate, requireRole } from '@/middleware/auth.js'
import { UserRole } from '@shared/types/enums'
import * as ctrl from '@/controllers/curing-pool-controller.js'

export const curingPoolRouter = Router()
curingPoolRouter.use(authenticate)

curingPoolRouter.get('/', ctrl.listPools)
curingPoolRouter.post('/', requireRole(UserRole.OWNER, UserRole.MANAGER, UserRole.LAB_TECHNICIAN, UserRole.QC_ENGINEER, UserRole.ADMIN), ctrl.createPool)
curingPoolRouter.patch('/:id', requireRole(UserRole.OWNER, UserRole.MANAGER, UserRole.LAB_TECHNICIAN, UserRole.QC_ENGINEER, UserRole.ADMIN), ctrl.updatePool)
curingPoolRouter.get('/:id/zones', ctrl.getZones)
curingPoolRouter.post('/:id/zones/:zoneId/assign', requireRole(UserRole.OWNER, UserRole.MANAGER, UserRole.LAB_TECHNICIAN, UserRole.QC_ENGINEER, UserRole.ADMIN), ctrl.assignZone)
curingPoolRouter.post('/:id/zones/:zoneId/release', requireRole(UserRole.OWNER, UserRole.MANAGER, UserRole.LAB_TECHNICIAN, UserRole.QC_ENGINEER, UserRole.ADMIN), ctrl.releaseZone)
