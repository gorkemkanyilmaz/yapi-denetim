import { Queue } from 'bullmq'
import IORedis from 'ioredis'

const connection: any = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null })

export const syncQueue = new Queue('field-sync', { connection })
export const slaCheckQueue = new Queue('sla-checks', { connection })
export const pdfQueue = new Queue('pdf-generation', { connection })
