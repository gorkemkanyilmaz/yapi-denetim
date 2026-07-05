import { Router } from 'express'
import { authenticate, requireRole } from '@/middleware/auth.js'
import { UserRole } from '@shared/types/enums'
import * as ctrl from '@/controllers/sample-controller.js'

export const sampleRouter = Router()
sampleRouter.use(authenticate)

sampleRouter.get('/', ctrl.listSampleSets)
sampleRouter.get('/construction-sites', ctrl.listConstructionSites)
sampleRouter.post('/construction-sites', requireRole(UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN), ctrl.createConstructionSite)
sampleRouter.patch('/construction-sites/:id', requireRole(UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN), ctrl.updateConstructionSite)
sampleRouter.get('/bypass-requests', requireRole(UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN), ctrl.listBypassRequests)
sampleRouter.patch('/bypass-requests/:id/approve', requireRole(UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN), ctrl.approveBypassRequest)
sampleRouter.get('/:id', ctrl.getSampleSet)
sampleRouter.post('/', ctrl.createSampleSet)
sampleRouter.patch('/:id/status', ctrl.transition)
sampleRouter.patch('/:id/assign', requireRole(UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN), ctrl.assignSampleSet)
sampleRouter.patch('/:id/accept', ctrl.acceptSampleSet)
sampleRouter.post('/:id/signatures', ctrl.addSignature)
sampleRouter.get('/:id/audit', ctrl.getAudit)
