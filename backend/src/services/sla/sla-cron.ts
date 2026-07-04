import cron from 'node-cron'
import { pool } from '@/config/database.js'
import {
  SlaAlertLevel,
  SLA_MOLD_REMOVAL_MAX_HOURS,
  SLA_MOLD_REMOVAL_WARN_HOURS,
  SLA_TEST_WINDOW_ADVANCE_HOURS,
  SLA_CURING_DISCHARGE_MAX_HOURS,
} from '@shared/types/enums'
import { logger } from '@/utils/logger.js'

const SEC_PER_HOUR = 3600

function hoursToSeconds(h: number): number {
  return h * SEC_PER_HOUR
}

export interface SlaCronResult {
  moldWarnings: number
  moldCriticals: number
  testWindowUpdated: number
  curingDischargeReverted: number
  equipmentBlocked: number
  notificationsInserted: number
}

export async function runMoldRemovalSlaCheck(): Promise<{
  warnings: number
  criticals: number
  notificationsInserted: number
}> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const secWarn = hoursToSeconds(SLA_MOLD_REMOVAL_WARN_HOURS)
    const secMax = hoursToSeconds(SLA_MOLD_REMOVAL_MAX_HOURS)

    const warn = await client.query<{ id: string; tenant_id: string }>(
      `UPDATE sample_sets
          SET sla_alert = 'warning'
        WHERE status IN ('collected','in_transit')
          AND collected_at IS NOT NULL
          AND sla_alert = 'normal'
          AND EXTRACT(EPOCH FROM (NOW() - collected_at)) > $1
          AND EXTRACT(EPOCH FROM (NOW() - collected_at)) <= $2
       RETURNING id, tenant_id`,
      [secWarn, secMax],
    )

    const crit = await client.query<{ id: string; tenant_id: string }>(
      `UPDATE sample_sets
          SET sla_alert = 'critical'
        WHERE status IN ('collected','in_transit')
          AND collected_at IS NOT NULL
          AND sla_alert IN ('normal','warning')
          AND EXTRACT(EPOCH FROM (NOW() - collected_at)) > $1
       RETURNING id, tenant_id`,
      [secMax],
    )

    const all = [...warn.rows, ...crit.rows]
    let notifications = 0
    for (const r of all) {
      const level = crit.rows.includes(r) ? 'critical' : 'warning'
      const recipients = await client.query<{ id: string }>(
        `SELECT id FROM users
          WHERE tenant_id = $1 AND role IN ('owner','manager') AND is_active = TRUE`,
        [r.tenant_id],
      )
      for (const u of recipients.rows) {
        const dup = await client.query(
          `SELECT 1 FROM notifications
            WHERE tenant_id = $1 AND user_id = $2
              AND entity_type = 'sample_set' AND entity_id = $3
              AND alert_level = $4 AND is_read = FALSE
            LIMIT 1`,
          [r.tenant_id, u.id, r.id, level],
        )
        if ((dup.rowCount ?? 0) > 0) continue
        await client.query(
          `INSERT INTO notifications
             (tenant_id, user_id, title, message, alert_level, entity_type, entity_id)
           VALUES ($1,$2,$3,$4,$5,'sample_set',$6)`,
          [
            r.tenant_id, u.id,
            level === 'critical' ? 'KRİTİK: 48 saat mold SLA aşımı' : 'Uyarı: 24 saat mold SLA sınırı',
            `Numune seti(${r.id}) kalıptan kür havuzuna zamanında alınmamış. Bakanlık SLA ihlali riski.`,
            level, r.id,
          ],
        )
        notifications += 1
      }
    }

    await client.query('COMMIT')
    return { warnings: warn.rowCount ?? 0, criticals: crit.rowCount ?? 0, notificationsInserted: notifications }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function runTestWindowCalendarPrepopulation(): Promise<number> {
  const r = await pool.query<{ id: string; sample_set_id: string; specimen_no: number; target_test_date: Date }>(
    `UPDATE specimens
        SET sla_alert = CASE
          WHEN target_test_date < CURRENT_DATE THEN 'critical'
          WHEN target_test_date = CURRENT_DATE THEN 'critical'
          WHEN target_test_date = CURRENT_DATE + 1 THEN 'warning'
          WHEN target_test_date <= CURRENT_DATE + ($1 || ' hours')::interval THEN 'warning'
          ELSE sla_alert
        END
      WHERE status NOT IN ('tested','approved','archived')
        AND sla_alert = 'normal'
        AND target_test_date <= CURRENT_DATE + ($1 || ' hours')::interval
      RETURNING id, sample_set_id, specimen_no, target_test_date`,
    [String(SLA_TEST_WINDOW_ADVANCE_HOURS)],
  )

  if (r.rowCount && r.rowCount > 0) {
    logger.info('Calendar pre-populated', { count: r.rowCount })
  }
  return r.rowCount ?? 0
}

export async function runCuringDischargeCheck(): Promise<number> {
  const secMax = hoursToSeconds(SLA_CURING_DISCHARGE_MAX_HOURS)
  const r = await pool.query<{ id: string; tenant_id: string }>(
    `UPDATE sample_sets
        SET status = 'in_curing',
            curing_ended_at = NULL,
            curing_pool_zone_id = NULL,
            sla_alert = 'critical'
      WHERE status = 'scheduled_for_test'
        AND curing_ended_at IS NOT NULL
        AND EXTRACT(EPOCH FROM (NOW() - curing_ended_at)) > $1
       RETURNING id, tenant_id`,
    [secMax],
  )
  if ((r.rowCount ?? 0) > 0) {
    await pool.query(
      `UPDATE specimens
          SET status = 'in_curing'
        WHERE sample_set_id = ANY($1::uuid[])`,
      [r.rows.map((x) => x.id)],
    )
  }
  return r.rowCount ?? 0
}

export async function runEquipmentCalibrationCheck(): Promise<number> {
  const r = await pool.query(
    `UPDATE equipment
        SET is_calibrated = FALSE, is_blocked = TRUE
      WHERE calibration_expiry_date < CURRENT_DATE
        AND (is_calibrated = TRUE OR is_blocked = FALSE)
      RETURNING id`,
  )
  return r.rowCount ?? 0
}

export function startCronJobs(): void {
  cron.schedule('*/15 * * * *', async () => {
    try {
      const m = await runMoldRemovalSlaCheck()
      const t = await runTestWindowCalendarPrepopulation()
      const cd = await runCuringDischargeCheck()
      const e = await runEquipmentCalibrationCheck()
      logger.info(
        'SLA cron tick',
        { moldWarnings: m.warnings, moldCriticals: m.criticals, notifs: m.notificationsInserted, tests: t, curing: cd, equipment: e },
      )
    } catch (err) {
      logger.error('SLA cron failure', { err })
    }
  })
  logger.info('SLA cron jobs started (every 15 min)')
}

export { SlaAlertLevel }