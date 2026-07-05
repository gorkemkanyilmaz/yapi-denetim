import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'yapi-denetim-offline'
const DB_VERSION = 1

export interface QueuedOp {
  id?: number
  idempotencyKey: string
  endpoint: string
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  payload: unknown
  createdAt: string
  attempts: number
  lastError?: string
}

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('queue')) {
          db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true })
        }
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache', { keyPath: 'key' })
        }
      },
    })
  }
  return dbPromise
}

export async function enqueueOp(op: Omit<QueuedOp, 'id' | 'createdAt' | 'attempts'>): Promise<void> {
  const db = await getDb()
  await db.add('queue', { ...op, createdAt: new Date().toISOString(), attempts: 0 })
}

export async function listQueue(): Promise<QueuedOp[]> {
  const db = await getDb()
  return db.getAll('queue') as Promise<QueuedOp[]>
}

export async function removeFromQueue(id: number): Promise<void> {
  const db = await getDb()
  await db.delete('queue', id)
}

export async function bumpAttempt(id: number, err: string): Promise<void> {
  const db = await getDb()
  const op = (await db.get('queue', id)) as QueuedOp | undefined
  if (op) {
    op.attempts += 1
    op.lastError = err
    await db.put('queue', op)
  }
}

export async function flushQueue(token: string, tenantId: string): Promise<{ flushed: number; failed: number }> {
  const ops = await listQueue()
  let flushed = 0
  let failed = 0
  for (const op of ops) {
    try {
      const res = await fetch(op.endpoint, {
        method: op.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-tenant-id': tenantId,
        },
        body: JSON.stringify(op.payload),
      })
      if (!res.ok) throw new Error(`status_${res.status}`)
      if (op.id !== undefined) await removeFromQueue(op.id)
      flushed += 1
    } catch (err) {
      if (op.id !== undefined) await bumpAttempt(op.id, String(err))
      failed += 1
    }
  }
  return { flushed, failed }
}

export async function cachePut(key: string, value: unknown): Promise<void> {
  const db = await getDb()
  await db.put('cache', { key, value, ts: Date.now() })
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const db = await getDb()
  const entry = (await db.get('cache', key)) as { key: string; value: T } | undefined
  return entry?.value ?? null
}
