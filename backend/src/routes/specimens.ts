import { Router } from 'express'
import { authenticate } from '@/middleware/auth.js'
import * as ctrl from '@/controllers/specimen-controller.js'

export const specimenRouter = Router()
specimenRouter.use(authenticate)

specimenRouter.get('/', ctrl.listSpecimens)
specimenRouter.get('/upcoming-tests', ctrl.upcomingTests)
specimenRouter.get('/sla-violations', ctrl.slaViolations)
specimenRouter.get('/:id', ctrl.getSpecimen)
specimenRouter.post('/:id/test-result', ctrl.submitTestResult)
specimenRouter.get('/by-sample-set/:sampleSetId/pacal', ctrl.getPacalStats)
