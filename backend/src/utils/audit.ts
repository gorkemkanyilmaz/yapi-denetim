import { pool } from '@/config/database.js'
import { PoolClient } from 'pg'
import crypto from 'crypto'

export interface AuditEntry {
  tenantId: string
  userId: string
  entityType: string
  entityId: string
  action: 'INSERT' | 'UPDATE' | 'DELETE' | 'STATE_TRANSITION'
  fieldName?: string
  oldValue?: string | null
  newValue?: string | null
  ipAddress: string
  userAgent: string
  metadata?: Record<string, unknown>
}

function hashForChain(prevHash: string, entry: AuditEntry): string {
  const payload = JSON.stringify({ prevHash, entry })
  return crypto.createHash('sha256').update(payload).digest('hex')
}

export async function recordAudit(
  client: PoolClient | typeof pool,
  entry: AuditEntry,
): Promise<void> {
  const last = await client.query<{ hash: string }>(
    `SELECT hash FROM audit_logs
     WHERE entity_type = $1 AND entity_id = $2
     ORDER BY created_at DESC LIMIT 1`,
    [entry.entityType, entry.entityId],
  )
  const prevHash = last.rows[0]?.hash ?? 'GENESIS'
  const hash = hashForChain(prevHash, entry)

  await client.query(
    `INSERT INTO audit_logs
       (tenant_id, user_id, entity_type, entity_id, action,
        field_name, old_value, new_value, ip_address, user_agent, metadata, hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      entry.tenantId,
      entry.userId,
      entry.entityType,
      entry.entityId,
      entry.action,
      entry.fieldName ?? null,
      entry.oldValue ?? null,
      entry.newValue ?? null,
      entry.ipAddress,
      entry.userAgent,
      JSON.stringify(entry.metadata ?? {}),
      hash,
    ],
  )
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}
