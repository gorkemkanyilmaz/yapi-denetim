import { pool } from '@/config/database.js'
import {
  SLA_MOLD_REMOVAL_WARN_HOURS,
  SLA_CURING_DISCHARGE_MAX_HOURS,
} from '@shared/types/enums.js'

export async function runSlaChecks(tenantId: string) {
  const moldViolations = await pool.query(
    `SELECT ss.id, ss.collected_at,
            EXTRACT(EPOCH FROM (NOW() - ss.collected_at)) / 3600 AS elapsed_hours
     FROM sample_sets ss
     WHERE ss.tenant_id = $1
       AND ss.status IN ('collected', 'in_transit')
       AND ss.collected_at IS NOT NULL
       AND EXTRACT(EPOCH FROM (NOW() - ss.collected_at)) / 3600 > $2`,
    [tenantId, SLA_MOLD_REMOVAL_WARN_HOURS],
  )

  const testWindowViolations = await pool.query(
    `SELECT sp.id, sp.sample_set_id, sp.target_test_date, sp.target_age_days
     FROM specimens sp
     JOIN sample_sets ss ON ss.id = sp.sample_set_id
     WHERE ss.tenant_id = $1
       AND sp.status NOT IN ('tested', 'approved', 'archived')
       AND sp.target_test_date <= CURRENT_DATE`,
    [tenantId],
  )

  const curingDischargeViolations = await pool.query(
    `SELECT ss.id, ss.curing_ended_at,
            EXTRACT(EPOCH FROM (NOW() - ss.curing_ended_at)) / 3600 AS elapsed_hours
     FROM sample_sets ss
     WHERE ss.tenant_id = $1
       AND ss.status = 'scheduled_for_test'
       AND ss.curing_ended_at IS NOT NULL
       AND EXTRACT(EPOCH FROM (NOW() - ss.curing_ended_at)) / 3600 > $2`,
    [tenantId, SLA_CURING_DISCHARGE_MAX_HOURS],
  )

  return {
    mold_removal: moldViolations.rows,
    test_window: testWindowViolations.rows,
    curing_discharge: curingDischargeViolations.rows,
  }
}
