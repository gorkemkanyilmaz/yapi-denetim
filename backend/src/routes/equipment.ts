import { Router } from 'express'
import { authenticate, requireRole } from '@/middleware/auth.js'
import { UserRole } from '@shared/types/enums'
import * as ctrl from '@/controllers/equipment-controller.js'

export const equipmentRouter = Router()
equipmentRouter.use(authenticate)

equipmentRouter.get('/', ctrl.listEquipment)
equipmentRouter.get('/expiring', requireRole(UserRole.OWNER, UserRole.MANAGER, UserRole.QC_ENGINEER, UserRole.ADMIN), ctrl.expiringEquipment)
equipmentRouter.post('/', requireRole(UserRole.OWNER, UserRole.MANAGER, UserRole.QC_ENGINEER, UserRole.ADMIN), ctrl.createEquipment)
equipmentRouter.patch('/:id/calibrate', requireRole(UserRole.OWNER, UserRole.MANAGER, UserRole.QC_ENGINEER, UserRole.ADMIN), ctrl.recalibrate)
