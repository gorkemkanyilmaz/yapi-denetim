import { Router } from 'express'
import { authenticate } from '@/middleware/auth.js'
import * as ctrl from '@/controllers/sample-controller.js'

export const sampleRouter = Router()
sampleRouter.use(authenticate)

sampleRouter.get('/', ctrl.listSampleSets)
sampleRouter.get('/construction-sites', ctrl.listConstructionSites)
sampleRouter.post('/construction-sites', ctrl.createConstructionSite)
sampleRouter.patch('/construction-sites/:id', ctrl.updateConstructionSite)
sampleRouter.get('/bypass-requests', ctrl.listBypassRequests)
sampleRouter.patch('/bypass-requests/:id/approve', ctrl.approveBypassRequest)
sampleRouter.get('/:id', ctrl.getSampleSet)
sampleRouter.post('/', ctrl.createSampleSet)
sampleRouter.patch('/:id/status', ctrl.transition)
sampleRouter.patch('/:id/assign', ctrl.assignSampleSet)
sampleRouter.patch('/:id/accept', ctrl.acceptSampleSet)
sampleRouter.post('/:id/signatures', ctrl.addSignature)
sampleRouter.get('/:id/audit', ctrl.getAudit)
