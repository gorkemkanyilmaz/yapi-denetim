import {
  SampleStatus,
  VALID_TRANSITIONS,
  SlaAlertLevel,
  SLA_MOLD_REMOVAL_MAX_HOURS,
  SLA_MOLD_REMOVAL_WARN_HOURS,
  SLA_CURING_DISCHARGE_MAX_HOURS,
} from '@shared/types/enums'
import { recordAudit, withTransaction } from '@/utils/audit.js'
import { assertEbisField } from '@/validators/ebis.js'
import type { PoolClient } from 'pg'

export class StateMachineError extends Error {
  constructor(
    public readonly fromStatus: SampleStatus,
    public readonly toStatus: SampleStatus,
    message: string,
  ) {
    super(message)
    this.name = 'StateMachineError'
  }
}

export class SlaViolationError extends Error {
  constructor(
    public readonly violationType: string,
    message: string,
  ) {
    super(message)
    this.name = 'SlaViolationError'
  }
}

export class GeofenceViolationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GeofenceViolationError'
  }
}

interface TransitionContext {
  tenantId: string
  userId: string
  ipAddress: string
  userAgent: string
  metadata?: Record<string, unknown>
}

function ensureValidTransition(from: SampleStatus, to: SampleStatus): void {
  const allowed = VALID_TRANSITIONS[from] ?? []
  if (!allowed.includes(to)) {
    throw new StateMachineError(
      from,
      to,
      `Geçersiz durum geçişi: ${from} -> ${to}. İzin verilen: [${allowed.join(', ')}]`,
    )
  }
}

async function assertEquipmentCalibrated(
  client: PoolClient,
  tenantId: string,
  equipmentId: string | null | undefined,
): Promise<void> {
  if (!equipmentId) return
  const r = await client.query<{ is_calibrated: boolean; is_blocked: boolean; name: string }>(
    `SELECT is_calibrated, is_blocked, name FROM equipment WHERE id = $1 AND tenant_id = $2`,
    [equipmentId, tenantId],
  )
  const eq = r.rows[0]
  if (!eq) throw new SlaViolationError('equipment_not_found', 'Cihaz bulunamadı veya tenantınıza ait değil')
  if (eq.is_blocked || !eq.is_calibrated) {
    throw new SlaViolationError(
      'equipment_uncalibrated',
      `Cihaz kalibrasyonu geçersiz: ${eq.name}. Test kaydı engellendi.`,
    )
  }
}

async function assertMoldRemovalSla(
  client: PoolClient,
  sampleSetId: string,
  toStatus: SampleStatus,
): Promise<void> {
  if (toStatus !== SampleStatus.IN_CURING) return
  const r = await client.query<{ collected_at: Date }>(
    `SELECT collected_at FROM sample_sets WHERE id = $1`,
    [sampleSetId],
  )
  const row = r.rows[0]
  if (!row?.collected_at) {
    throw new SlaViolationError('not_collected', 'Numune henüz alınmamış, kür havuzuna alınamaz')
  }
  const elapsedH = (Date.now() - new Date(row.collected_at).getTime()) / 36e5
  if (elapsedH > SLA_MOLD_REMOVAL_MAX_HOURS) {
    throw new SlaViolationError(
      'mold_removal_overrun',
      `Mold çıkarma SLA aşıldı: ${elapsedH.toFixed(1)} saat > ${SLA_MOLD_REMOVAL_MAX_HOURS} saat`,
    )
  }
}

async function assertCuringDischargeSla(
  client: PoolClient,
  sampleSetId: string,
  toStatus: SampleStatus,
): Promise<void> {
  if (toStatus !== SampleStatus.SCHEDULED_FOR_TEST) return
  const r = await client.query<{ curing_ended_at: Date | null }>(
    `SELECT curing_ended_at FROM sample_sets WHERE id = $1`,
    [sampleSetId],
  )
  const row = r.rows[0]
  if (!row?.curing_ended_at) return
  const elapsedH = (Date.now() - new Date(row.curing_ended_at).getTime()) / 36e5
  if (elapsedH > SLA_CURING_DISCHARGE_MAX_HOURS) {
    throw new SlaViolationError(
      'curing_discharge_overrun',
      `Kür havuzundan çıkarma süresi aşıldı: ${elapsedH.toFixed(1)} saat > ${SLA_CURING_DISCHARGE_MAX_HOURS} saat`,
    )
  }
}

export interface TransitionInput {
  sampleSetId: string
  toStatus: SampleStatus
  payload?: {
    ebisProtocolNo?: string
    ebisFisNo?: string
    concreteClass?: string
    gps?: { lat: number; lng: number; accuracyM?: number }
    geofenceValid?: boolean
    geofenceOverride?: boolean
    managerBypassToken?: string
    curingPoolZoneId?: string
    curingEndedAt?: string
    equipmentId?: string
    notes?: string
  }
}

export async function transitionSampleSet(
  input: TransitionInput,
  ctx: TransitionContext,
): Promise<{ id: string; status: SampleStatus; transitionedAt: string }> {
  return withTransaction(async (client) => {
    const r = await client.query<{
      id: string
      status: SampleStatus
      tenant_id: string
      collected_at: Date | null
    }>(
      `SELECT id, status, tenant_id, collected_at FROM sample_sets WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [input.sampleSetId, ctx.tenantId],
    )
    const row = r.rows[0]
    if (!row) {
      throw new StateMachineError(SampleStatus.CREATED, input.toStatus, 'Numune seti bulunamadı veya tenantınıza ait değil')
    }

    const fromStatus = row.status as SampleStatus
    ensureValidTransition(fromStatus, input.toStatus)
    await assertMoldRemovalSla(client, input.sampleSetId, input.toStatus)
    await assertCuringDischargeSla(client, input.sampleSetId, input.toStatus)
    await assertEquipmentCalibrated(client, ctx.tenantId, input.payload?.equipmentId)

    let ebisProtocol: string | null = null
    let ebisFis: string | null = null
    if (input.toStatus === SampleStatus.COLLECTED) {
      if (input.payload?.ebisProtocolNo) {
        ebisProtocol = assertEbisField('protocol_no', input.payload.ebisProtocolNo)
      }
      if (input.payload?.ebisFisNo) {
        ebisFis = assertEbisField('fis_no', input.payload.ebisFisNo)
      }
    }

    const setClauses: string[] = ['status = $2', 'updated_at = NOW()']
    const values: unknown[] = [input.sampleSetId, input.toStatus]
    let i = 3

    if (input.toStatus === SampleStatus.COLLECTED) {
      setClauses.push(`collected_by = $${i++}`, `collected_at = NOW()`)
      values.push(ctx.userId)
      if (input.payload?.gps) {
        setClauses.push(`gps_lat = $${i++}`, `gps_lng = $${i++}`)
        values.push(input.payload.gps.lat, input.payload.gps.lng)
        if (input.payload.gps.accuracyM !== undefined) {
          setClauses.push(`gps_accuracy_m = $${i++}`)
          values.push(input.payload.gps.accuracyM)
        }
      }
      if (input.payload?.geofenceValid !== undefined) {
        setClauses.push(`geofence_valid = $${i++}`)
        values.push(input.payload.geofenceValid)
      }
      if (input.payload?.geofenceOverride !== undefined) {
        setClauses.push(`geofence_override = $${i++}`)
        values.push(input.payload.geofenceOverride)
      }
      if (ebisProtocol) {
        setClauses.push(`ebis_protocol_no = $${i++}`)
        values.push(ebisProtocol)
      }
      if (ebisFis) {
        setClauses.push(`ebis_fis_no = $${i++}`)
        values.push(ebisFis)
      }
      if (input.payload?.concreteClass) {
        setClauses.push(`concrete_class = $${i++}`)
        values.push(input.payload.concreteClass)
      }
    }

    if (input.toStatus === SampleStatus.RECEIVED) {
      setClauses.push(`received_by = $${i++}`, `received_at = NOW()`)
      values.push(ctx.userId)
    }

    if (input.toStatus === SampleStatus.IN_CURING) {
      if (!input.payload?.curingPoolZoneId) {
        throw new SlaViolationError('missing_zone', 'Kür havuzu bölgesi seçilmedi')
      }
      setClauses.push(
        `curing_pool_zone_id = $${i++}`,
        `curing_started_at = NOW()`,
        `sla_alert = 'normal'`,
      )
      values.push(input.payload.curingPoolZoneId)
    }

    if (input.toStatus === SampleStatus.SCHEDULED_FOR_TEST) {
      setClauses.push(`curing_ended_at = $${i++}`)
      values.push(input.payload?.curingEndedAt ?? new Date().toISOString())
    }

    if (input.toStatus === SampleStatus.TESTED) {
      if (input.payload?.equipmentId) {
        await client.query(
          `UPDATE specimens SET equipment_id = $2 WHERE sample_set_id = $1`,
          [input.sampleSetId, input.payload.equipmentId],
        )
      }
    }

    if (input.payload?.notes) {
      setClauses.push(`notes = $${i++}`)
      values.push(input.payload.notes)
    }

    await client.query(
      `UPDATE sample_sets SET ${setClauses.join(', ')} WHERE id = $1`,
      values,
    )

    if (input.toStatus === SampleStatus.IN_CURING && input.payload?.curingPoolZoneId) {
      await client.query(
        `UPDATE curing_pool_zones
           SET is_occupied = TRUE, current_sample_set_id = $2
         WHERE id = $1`,
        [input.payload.curingPoolZoneId, input.sampleSetId],
      )
    }
    if (fromStatus === SampleStatus.SCHEDULED_FOR_TEST && row.id) {
      await client.query(
        `UPDATE curing_pool_zones
           SET is_occupied = FALSE, current_sample_set_id = NULL
         WHERE current_sample_set_id = $1`,
        [input.sampleSetId],
      )
    }

    if (input.toStatus === SampleStatus.SCHEDULED_FOR_TEST) {
      await client.query(
        `UPDATE specimens
            SET status = 'scheduled_for_test'
          WHERE sample_set_id = $1 AND status = 'in_curing'`,
        [input.sampleSetId],
      )
    }

    if (input.toStatus === SampleStatus.TESTED) {
      await client.query(
        `UPDATE specimens
            SET status = 'tested', actual_test_date = CURRENT_DATE
          WHERE sample_set_id = $1 AND status = 'scheduled_for_test'`,
        [input.sampleSetId],
      )
    }

    if (input.toStatus === SampleStatus.APPROVED) {
      await client.query(
        `UPDATE specimens
            SET status = 'approved'
          WHERE sample_set_id = $1 AND status = 'tested'`,
        [input.sampleSetId],
      )
    }

    if (input.toStatus === SampleStatus.ARCHIVED) {
      await client.query(
        `UPDATE specimens
            SET status = 'archived'
          WHERE sample_set_id = $1 AND status = 'approved'`,
        [input.sampleSetId],
      )
    }

    await recordAudit(client, {
      tenantId: row.tenant_id,
      userId: ctx.userId,
      entityType: 'sample_set',
      entityId: row.id,
      action: 'STATE_TRANSITION',
      fieldName: 'status',
      oldValue: fromStatus,
      newValue: input.toStatus,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: ctx.metadata,
    })

    return {
      id: row.id,
      status: input.toStatus,
      transitionedAt: new Date().toISOString(),
    }
  })
}

export function computeSlaAlert(targetTestDate: string): SlaAlertLevel {
  const target = new Date(targetTestDate).getTime()
  const now = Date.now()
  const diffH = (target - now) / 36e5
  if (diffH < 0) return SlaAlertLevel.CRITICAL
  if (diffH <= 24) return SlaAlertLevel.CRITICAL
  if (diffH <= 48) return SlaAlertLevel.WARNING
  return SlaAlertLevel.NORMAL
}

export function computeMoldRemovalAlert(
  collectedAt: string | Date,
): SlaAlertLevel {
  const elapsedH = (Date.now() - new Date(collectedAt).getTime()) / 36e5
  if (elapsedH > SLA_MOLD_REMOVAL_MAX_HOURS) return SlaAlertLevel.BLOCKED
  if (elapsedH > SLA_MOLD_REMOVAL_WARN_HOURS) return SlaAlertLevel.CRITICAL
  if (elapsedH > SLA_MOLD_REMOVAL_WARN_HOURS * 0.75) return SlaAlertLevel.WARNING
  return SlaAlertLevel.NORMAL
}
