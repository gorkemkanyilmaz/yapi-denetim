import { Router } from 'express'
import { authenticate } from '@/middleware/auth.js'
import * as ctrl from '@/controllers/dashboard-controller.js'

export const dashboardRouter = Router()
dashboardRouter.use(authenticate)

dashboardRouter.get('/stats', ctrl.stats)
dashboardRouter.get('/kanban', ctrl.kanban)
dashboardRouter.get('/calendar', ctrl.calendar)
dashboardRouter.get('/map', ctrl.mapView)
dashboardRouter.get('/financial', ctrl.financial)
