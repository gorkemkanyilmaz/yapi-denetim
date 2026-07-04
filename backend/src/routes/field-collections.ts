import { Router } from 'express'
import multer from 'multer'
import { authenticate } from '@/middleware/auth.js'
import * as ctrl from '@/controllers/field-collection-controller.js'

export const fieldCollectionRouter = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })
fieldCollectionRouter.use(authenticate)

fieldCollectionRouter.post('/', ctrl.createFieldCollection)
fieldCollectionRouter.post('/sync', ctrl.bulkSync)
fieldCollectionRouter.post('/ocr', upload.single('receipt'), ctrl.ocrReceipt)
fieldCollectionRouter.post('/validate-geofence', ctrl.validateGeofenceEndpoint)
