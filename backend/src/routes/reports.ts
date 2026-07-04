import { Router } from 'express'
import { authenticate } from '@/middleware/auth.js'
import * as ctrl from '@/controllers/report-controller.js'

export const reportRouter = Router()
reportRouter.use(authenticate)

reportRouter.post('/generate', ctrl.generate)
reportRouter.post('/batch-generate', ctrl.batchGenerate)
reportRouter.get('/:id/pdf', ctrl.getPdf)
