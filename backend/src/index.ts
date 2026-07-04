import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import dotenv from 'dotenv'
import rateLimit from 'express-rate-limit'
import { pool } from './config/database.js'
import { verifyToken } from './middleware/auth.js'
import { tenantMiddleware } from './middleware/tenant.js'
import { errorHandler } from './middleware/error-handler.js'
import { authRouter } from './routes/auth.js'
import { sampleRouter } from './routes/samples.js'
import { specimenRouter } from './routes/specimens.js'
import { equipmentRouter } from './routes/equipment.js'
import { curingPoolRouter } from './routes/curing-pools.js'
import { hakedisRouter } from './routes/hakedis.js'
import { reportRouter } from './routes/reports.js'
import { dashboardRouter } from './routes/dashboard.js'
import { fieldCollectionRouter } from './routes/field-collections.js'
import { startCronJobs } from './services/sla/sla-cron.js'
import { logger } from './utils/logger.js'

dotenv.config()

const app = express()
const PORT = Number(process.env.PORT ?? 3000)

app.use(helmet())
app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173', credentials: true }))
app.use(express.json({ limit: '20mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(morgan('combined'))
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }))

app.use((req, _res, next) => {
  const h = req.headers.authorization
  if (h && h.startsWith('Bearer ')) {
    try { req.user = verifyToken(h.slice(7)) } catch { /* invalid token ignored; route-level authenticate handles 401 */ }
  }
  next()
})
app.use(tenantMiddleware)

app.use('/api/auth', authRouter)
app.use('/api/samples', sampleRouter)
app.use('/api/specimens', specimenRouter)
app.use('/api/equipment', equipmentRouter)
app.use('/api/curing-pools', curingPoolRouter)
app.use('/api/hakedis', hakedisRouter)
app.use('/api/reports', reportRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/field-collections', fieldCollectionRouter)

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', db: 'up', timestamp: new Date().toISOString() })
  } catch {
    res.status(503).json({ status: 'degraded', db: 'down' })
  }
})

app.use(errorHandler)

app.listen(PORT, () => {
  logger.info(`[Yapı Denetim API] Running on port ${PORT}`)
  if (process.env.NODE_ENV !== 'test') {
    startCronJobs()
  }
})

export { app, pool }
