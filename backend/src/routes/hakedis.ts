import { Router } from 'express'
import { authenticate } from '@/middleware/auth.js'
import * as ctrl from '@/controllers/hakedis-controller.js'

export const hakedisRouter = Router()
hakedisRouter.use(authenticate)

hakedisRouter.get('/', ctrl.listHakedis)
hakedisRouter.post('/', ctrl.createHakedis)
hakedisRouter.patch('/:id/status', ctrl.updateHakedisStatus)
hakedisRouter.get('/:id/export', ctrl.exportHakedis)
