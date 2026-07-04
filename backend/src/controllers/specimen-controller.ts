import type { Request, Response } from 'express'
import { pool } from '@/config/database.js'
import {
  calculateCompressiveStrength,
  calculatePacal,
} from '@/services/calculations/formula-calculator.js'
import { SlaAlertLevel, SLA_CURING_DISCHARGE_MAX_HOURS } from '@shared/types/enums'
import { logger } from '@/utils/logger.js'

export async function listSpecimens(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false, message: 'Tenant gerekli' }); return }
  const r = await pool.query(
    `SELECT sp.*, ss.ebis_protocol_no, ss.yif_no, ss.concrete_class
       FROM specimens sp
       JOIN sample_sets ss ON ss.id = sp.sample_set_id
      WHERE ss.tenant_id = $1
      ORDER BY sp.target_test_date ASC
      LIMIT 200`,
    [req.tenantId],
  )
  res.json({ success: true, data: r.rows })
}

export async function getSpecimen(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false, message: 'Tenant gerekli' }); return }
  const r = await pool.query(
    `SELECT sp.*, ss.ebis_protocol_no, ss.yif_no, ss.concrete_class
       FROM specimens sp
       JOIN sample_sets ss ON ss.id = sp.sample_set_id
      WHERE sp.id = $1 AND ss.tenant_id = $2`,
    [req.params.id, req.tenantId],
  )
  res.json({ success: true, data: r.rows[0] ?? null })
}

export async function submitTestResult(req: Request, res: Response): Promise<void> {
  if (!req.user || !req.tenantId) { res.status(401).json({ success: false }); return }
  const body = req.body as {
    widthMm: number; heightMm: number; diameterMm?: number;
    weightGr: number; failureLoadKn: number; equipmentId: string; notes?: string;
  }
  const specimenR = await pool.query<{
    id: string; sample_set_id: string; target_age_days: number; concrete_class: string | null;
    curing_ended_at: Date | null;
  }>(
    `SELECT sp.id, sp.sample_set_id, sp.target_age_days, ss.concrete_class, ss.curing_ended_at
       FROM specimens sp JOIN sample_sets ss ON ss.id = sp.sample_set_id
      WHERE sp.id = $1 AND ss.tenant_id = $2`,
    [req.params.id, req.tenantId],
  )
  const specimen = specimenR.rows[0]
  if (!specimen) { res.status(404).json({ success: false, message: 'Numune bulunamadı' }); return }

  if (specimen.curing_ended_at) {
    const elapsedH = (Date.now() - new Date(specimen.curing_ended_at).getTime()) / 36e5
    if (elapsedH > SLA_CURING_DISCHARGE_MAX_HOURS) {
      res.status(422).json({
        success: false,
        code: 'curing_discharge_overrun',
        message: `Kür havuzundan çıkarma süresi aşıldı: ${elapsedH.toFixed(1)} saat > ${SLA_CURING_DISCHARGE_MAX_HOURS} saat. Numune havuza iade edilmeli.`,
      })
      return
    }
  }

  const eqCheck = await pool.query<{ is_blocked: boolean; is_calibrated: boolean; name: string }>(
    `SELECT is_blocked, is_calibrated, name FROM equipment WHERE id = $1 AND tenant_id = $2`,
    [body.equipmentId, req.tenantId],
  )
  if (!eqCheck.rows[0]) {
    res.status(403).json({ success: false, message: 'Cihaz tenantınıza ait değil veya bulunamadı' })
    return
  }
  if (eqCheck.rows[0].is_blocked || !eqCheck.rows[0].is_calibrated) {
    res.status(422).json({ success: false, code: 'equipment_uncalibrated', message: `Cihaz kalibrasyonu geçersiz: ${eqCheck.rows[0].name}` })
    return
  }

  const calc = calculateCompressiveStrength(
    { widthMm: body.widthMm, heightMm: body.heightMm, diameterMm: body.diameterMm, weightGr: body.weightGr, failureLoadKn: body.failureLoadKn },
    specimen.concrete_class ?? 'C25/30',
  )

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO test_results (specimen_id, equipment_id, tested_by, load_kn, area_mm2, strength_mpa, test_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE,$7)`,
      [req.params.id, body.equipmentId, req.user.userId, body.failureLoadKn, calc.areaMm2, calc.strengthMpa, body.notes ?? null],
    )
    await client.query(
      `UPDATE specimens
          SET width_mm=$2, height_mm=$3, diameter_mm=$4, weight_gr=$5, density_kg_m3=$6,
              failure_load_kn=$7, compressive_strength_mpa=$8,
              tested_by=$9, equipment_id=$10, actual_test_date=CURRENT_DATE,
              status='tested', sla_alert=$11
        WHERE id=$1`,
      [
        req.params.id, body.widthMm, body.heightMm, body.diameterMm ?? null, body.weightGr,
        calc.densityKgM3, body.failureLoadKn, calc.strengthMpa,
        req.user.userId, body.equipmentId, SlaAlertLevel.NORMAL,
      ],
    )
    await client.query('COMMIT')
    res.status(201).json({ success: true, data: { ...calc, passed: calc.passed } })
  } catch (err) {
    await client.query('ROLLBACK')
    logger.error('submitTestResult failed', { err })
    res.status(500).json({ success: false, message: 'Test sonucu kaydedilemedi' })
  } finally {
    client.release()
  }
}

export async function getPacalStats(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false }); return }
  const r = await pool.query<{
    target_age_days: number; specimen_no: number; compressive_strength_mpa: number | null;
    concrete_class: string | null;
  }>(
    `SELECT sp.target_age_days, sp.specimen_no, sp.compressive_strength_mpa, ss.concrete_class
       FROM specimens sp
       JOIN sample_sets ss ON ss.id = sp.sample_set_id
      WHERE sp.sample_set_id = $1 AND ss.tenant_id = $2 AND sp.compressive_strength_mpa IS NOT NULL`,
    [req.params.sampleSetId, req.tenantId],
  )
  const ages = [7, 28]
  const result: Record<string, unknown> = {}
  for (const age of ages) {
    const subset = r.rows.filter((x) => x.target_age_days === age)
    if (subset.length === 0) continue
    const cls = subset[0].concrete_class ?? 'C25/30'
    const pacal = calculatePacal(
      subset.map((x) => Number(x.compressive_strength_mpa)),
      subset.map((x) => x.specimen_no),
      age,
      cls,
    )
    result[`${age}_days`] = pacal
  }
  res.json({ success: true, data: result })
}

export async function upcomingTests(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false }); return }
  const r = await pool.query(
    `SELECT sp.id, sp.specimen_no, sp.target_test_date, sp.target_age_days, sp.sla_alert,
            ss.ebis_protocol_no, ss.yif_no, ss.concrete_class,
            cs.name AS construction_site_name
       FROM specimens sp
       JOIN sample_sets ss ON ss.id = sp.sample_set_id
       JOIN construction_sites cs ON cs.id = ss.construction_site_id
      WHERE ss.tenant_id = $1
        AND sp.status NOT IN ('tested','approved','archived')
        AND sp.target_test_date <= CURRENT_DATE + 7
      ORDER BY sp.target_test_date ASC`,
    [req.tenantId],
  )
  res.json({ success: true, data: r.rows })
}

export async function slaViolations(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false }); return }
  const r = await pool.query(
    `SELECT sp.id, sp.sample_set_id, sp.specimen_no, sp.target_age_days, sp.target_test_date, sp.sla_alert,
            ss.ebis_protocol_no, ss.yif_no, ss.collected_at, ss.status,
            cs.name AS construction_site_name
       FROM specimens sp
       JOIN sample_sets ss ON ss.id = sp.sample_set_id
       JOIN construction_sites cs ON cs.id = ss.construction_site_id
      WHERE ss.tenant_id = $1 AND sp.sla_alert IN ('critical','warning','blocked')
         AND sp.status NOT IN ('tested','approved','archived')
      ORDER BY sp.sla_alert DESC, sp.target_test_date ASC`,
    [req.tenantId],
  )
  res.json({ success: true, data: r.rows })
}
