import { Router } from 'express'
import { authenticate } from '@/middleware/auth.js'
import * as ctrl from '@/controllers/equipment-controller.js'

export const equipmentRouter = Router()
equipmentRouter.use(authenticate)

equipmentRouter.get('/', ctrl.listEquipment)
equipmentRouter.get('/expiring', ctrl.expiringEquipment)
equipmentRouter.post('/', ctrl.createEquipment)
equipmentRouter.patch('/:id/calibrate', ctrl.recalibrate)
