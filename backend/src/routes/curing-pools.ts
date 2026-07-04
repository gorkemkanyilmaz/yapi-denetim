import { Router } from 'express'
import { authenticate } from '@/middleware/auth.js'
import * as ctrl from '@/controllers/curing-pool-controller.js'

export const curingPoolRouter = Router()
curingPoolRouter.use(authenticate)

curingPoolRouter.get('/', ctrl.listPools)
curingPoolRouter.post('/', ctrl.createPool)
curingPoolRouter.patch('/:id', ctrl.updatePool)
curingPoolRouter.get('/:id/zones', ctrl.getZones)
curingPoolRouter.post('/:id/zones/:zoneId/assign', ctrl.assignZone)
curingPoolRouter.post('/:id/zones/:zoneId/release', ctrl.releaseZone)
