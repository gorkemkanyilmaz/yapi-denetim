import type { Request, Response } from 'express'
import { pool } from '@/config/database.js'

export async function stats(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false }); return }

  // 1. All status counts
  const statusCountsRes = await pool.query<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::text AS count FROM sample_sets WHERE tenant_id = $1 GROUP BY status`,
    [req.tenantId]
  )
  const statusCounts = statusCountsRes.rows.reduce((acc, row) => {
    acc[row.status] = Number(row.count)
    return acc
  }, {} as Record<string, number>)

  const allStatuses = ['created', 'collected', 'in_transit', 'received', 'in_curing', 'scheduled_for_test', 'tested', 'approved', 'archived']
  for (const status of allStatuses) {
    if (statusCounts[status] === undefined) {
      statusCounts[status] = 0
    }
  }

  // 2. Daily and Monthly collections
  const collectionsRes = await pool.query<{ daily_collected: string; monthly_collected: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE collected_at::date = CURRENT_DATE)::text AS daily_collected,
       COUNT(*) FILTER (WHERE collected_at >= DATE_TRUNC('month', CURRENT_DATE))::text AS monthly_collected
     FROM sample_sets
     WHERE tenant_id = $1 AND collected_at IS NOT NULL`,
    [req.tenantId]
  )

  // 3. Daily and Monthly test crushings
  const crushingsRes = await pool.query<{ daily_crushed: string; monthly_crushed: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE sp.actual_test_date = CURRENT_DATE)::text AS daily_crushed,
       COUNT(*) FILTER (WHERE sp.actual_test_date >= DATE_TRUNC('month', CURRENT_DATE))::text AS monthly_crushed
     FROM specimens sp
     JOIN sample_sets ss ON ss.id = sp.sample_set_id
     WHERE ss.tenant_id = $1 AND sp.actual_test_date IS NOT NULL`,
    [req.tenantId]
  )

  const r = await pool.query(`SELECT * FROM v_dashboard_stats WHERE tenant_id = $1`, [req.tenantId])
  const slaR = await pool.query<{ critical_sla_violations: string; warning_sla_violations: string; mold_critical: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE sp.sla_alert = 'critical')::text AS critical_sla_violations,
       COUNT(*) FILTER (WHERE sp.sla_alert = 'warning')::text AS warning_sla_violations,
       ( SELECT COUNT(*)::text FROM sample_sets
           WHERE tenant_id = $1 AND sla_alert = 'critical'
             AND status NOT IN ('tested','approved','archived') )::text AS mold_critical
     FROM specimens sp
     JOIN sample_sets ss ON ss.id = sp.sample_set_id
     WHERE ss.tenant_id = $1 AND sp.status NOT IN ('tested','approved','archived')`,
    [req.tenantId],
  )
  const finR = await pool.query<{ pending_try: string; invoiced_try: string; paid_try: string }>(
    `SELECT
       COALESCE(SUM(total_amount_try) FILTER (WHERE status IN ('draft','submitted','approved')), 0)::text AS pending_try,
       COALESCE(SUM(total_amount_try) FILTER (WHERE status = 'invoiced'), 0)::text AS invoiced_try,
       COALESCE(SUM(total_amount_try) FILTER (WHERE status = 'paid'), 0)::text AS paid_try
     FROM hakedis WHERE tenant_id = $1`,
    [req.tenantId],
  )
  res.json({
    success: true,
    data: {
      samples: r.rows[0] ?? null,
      sla: slaR.rows[0] ?? null,
      financial: finR.rows[0] ?? null,
      statusCounts,
      periodicStats: {
        dailyCollected: Number(collectionsRes.rows[0]?.daily_collected ?? 0),
        monthlyCollected: Number(collectionsRes.rows[0]?.monthly_collected ?? 0),
        dailyCrushed: Number(crushingsRes.rows[0]?.daily_crushed ?? 0),
        monthlyCrushed: Number(crushingsRes.rows[0]?.monthly_crushed ?? 0),
      }
    },
  })
}

export async function kanban(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false }); return }
  const r = await pool.query(
    `SELECT ss.id, ss.status, ss.ebis_protocol_no, ss.yif_no, ss.concrete_class, ss.collected_at,
            ss.material_type, ss.created_at, ss.assigned_to, u.full_name AS assigned_user_name,
            ss.is_accepted, ss.accepted_at
       FROM sample_sets ss
       LEFT JOIN users u ON u.id = ss.assigned_to
      WHERE ss.tenant_id = $1
      ORDER BY ss.created_at DESC
      LIMIT 300`,
    [req.tenantId],
  )
  const grouped: Record<string, unknown[]> = {}
  for (const row of r.rows) {
    const s = row.status as string
    if (!grouped[s]) grouped[s] = []
    ;(grouped[s] as unknown[]).push(row)
  }
  res.json({ success: true, data: grouped })
}

export async function calendar(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false }); return }
  const r = await pool.query(
    `SELECT sp.id, sp.specimen_no, sp.target_test_date, sp.target_age_days, sp.sla_alert, sp.status,
            ss.ebis_protocol_no, ss.yif_no, ss.concrete_class,
            cs.name AS site_name
       FROM specimens sp
       JOIN sample_sets ss ON ss.id = sp.sample_set_id
       JOIN construction_sites cs ON cs.id = ss.construction_site_id
      WHERE ss.tenant_id = $1
        AND sp.target_test_date BETWEEN CURRENT_DATE - 7 AND CURRENT_DATE + 30
      ORDER BY sp.target_test_date ASC`,
    [req.tenantId],
  )
  res.json({ success: true, data: r.rows })
}

export async function mapView(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false }); return }
  const sites = await pool.query(
    `SELECT id, name, yif_no, address, latitude, longitude, is_active
       FROM construction_sites WHERE tenant_id = $1`,
    [req.tenantId],
  )
  const field = await pool.query(
    `SELECT fc.gps_lat, fc.gps_lng, fc.geofence_valid, fc.created_at,
            u.full_name AS collector_name, ss.ebis_protocol_no
       FROM field_collections fc
       JOIN users u ON u.id = fc.collected_by
       JOIN sample_sets ss ON ss.id = fc.sample_set_id
      WHERE ss.tenant_id = $1
      ORDER BY fc.created_at DESC LIMIT 100`,
    [req.tenantId],
  )
  res.json({ success: true, data: { sites: sites.rows, fieldPersonnel: field.rows } })
}

export async function financial(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false }); return }
  const r = await pool.query(
    `SELECT h.*, cs.name AS site_name, cs.yif_no
       FROM hakedis h
       JOIN construction_sites cs ON cs.id = h.construction_site_id
      WHERE h.tenant_id = $1
      ORDER BY h.period_end DESC LIMIT 50`,
    [req.tenantId],
  )
  res.json({ success: true, data: r.rows })
}
