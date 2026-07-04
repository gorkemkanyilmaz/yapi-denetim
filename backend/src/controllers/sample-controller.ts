import type { Request, Response } from 'express'
import { pool } from '@/config/database.js'
import { SampleStatus, MaterialType, StakeholderRole } from '@shared/types/enums'
import {
  transitionSampleSet,
  StateMachineError,
  SlaViolationError,
} from '@/services/state-machine/state-machine.js'
import { validateGeofence } from '@/services/geofence/geofence.js'
import { EbisValidationError } from '@/validators/ebis.js'
import { logger } from '@/utils/logger.js'

function pageParams(req: Request): { page: number; perPage: number; offset: number } {
  const page = Math.max(1, Number(req.query.page ?? 1))
  const perPage = Math.min(100, Math.max(1, Number(req.query.per_page ?? 20)))
  return { page, perPage, offset: (page - 1) * perPage }
}

export async function listSampleSets(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) {
    res.status(400).json({ success: false, message: 'Tenant gerekli' })
    return
  }
  const { page, perPage, offset } = pageParams(req)
  const status = req.query.status as SampleStatus | undefined
  const material = req.query.material as MaterialType | undefined
  const yif = req.query.yif_no as string | undefined

  const where: string[] = ['ss.tenant_id = $1']
  const params: unknown[] = [req.tenantId]
  if (status) { params.push(status); where.push(`ss.status = $${params.length}`) }
  if (material) { params.push(material); where.push(`ss.material_type = $${params.length}`) }
  if (yif) { params.push(yif); where.push(`ss.yif_no = $${params.length}`) }

  const countRow = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM sample_sets ss WHERE ${where.join(' AND ')}`,
    params,
  )
  const total = Number(countRow.rows[0].count)

  params.push(perPage, offset)
  const r = await pool.query(
    `SELECT ss.*, cs.name AS construction_site_name, u.full_name AS assigned_user_name
       FROM sample_sets ss
       LEFT JOIN construction_sites cs ON cs.id = ss.construction_site_id
       LEFT JOIN users u ON u.id = ss.assigned_to
      WHERE ${where.join(' AND ')}
      ORDER BY ss.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )

  res.json({
    success: true,
    data: r.rows,
    meta: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
  })
}

export async function getSampleSet(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false, message: 'Tenant gerekli' }); return }
  const r = await pool.query(
    `SELECT ss.*, cs.name AS construction_site_name, cs.address AS site_address,
            cs.contractor_name, cs.contractor_tax_no, cs.inspection_firm, cs.ready_mix_supplier,
            cs.concrete_class AS site_concrete_class, cs.latitude AS site_latitude, cs.longitude AS site_longitude,
            cs.geofence_radius_m, cs.santiye_sorumlusu_cep, cs.yif_no AS site_yif_no,
            u.full_name AS assigned_user_name, u.role AS assigned_user_role, u.phone AS assigned_user_phone,
            cp.name AS curing_pool_name, cp.temperature_c AS curing_pool_temperature,
            cpz.zone_label AS curing_zone_label, cpz.shelf_level AS curing_shelf_level
       FROM sample_sets ss
       LEFT JOIN construction_sites cs ON cs.id = ss.construction_site_id
       LEFT JOIN users u ON u.id = ss.assigned_to
       LEFT JOIN curing_pool_zones cpz ON cpz.id = ss.curing_pool_zone_id
       LEFT JOIN curing_pools cp ON cp.id = cpz.curing_pool_id
      WHERE ss.id = $1 AND ss.tenant_id = $2`,
    [req.params.id, req.tenantId],
  )
  if (!r.rows[0]) { res.status(404).json({ success: false, message: 'Bulunamadı' }); return }

  const specimens = await pool.query(
    `SELECT sp.*, u.full_name AS tested_by_name, e.name AS equipment_name
       FROM specimens sp
       LEFT JOIN users u ON u.id = sp.tested_by
       LEFT JOIN equipment e ON e.id = sp.equipment_id
      WHERE sp.sample_set_id = $1
      ORDER BY sp.target_age_days, sp.specimen_no`,
    [req.params.id],
  )
  const sigs = await pool.query(
    `SELECT * FROM stakeholder_signatures WHERE sample_set_id = $1 ORDER BY signed_at DESC`,
    [req.params.id],
  )
  const audit = await pool.query(
    `SELECT id, user_id, action, field_name, old_value, new_value, created_at
       FROM audit_logs
      WHERE entity_type = 'sample_set' AND entity_id = $1
      ORDER BY created_at DESC LIMIT 50`,
    [req.params.id],
  )
  res.json({
    success: true,
    data: {
      ...r.rows[0],
      specimens: specimens.rows,
      signatures: sigs.rows,
      audit: audit.rows,
    },
  })
}

export async function createSampleSet(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false, message: 'Tenant gerekli' }); return }
  const body = req.body as {
    constructionSiteId: string
    materialType: MaterialType
    concreteClass?: string
    yifNo: string
    assignedTo?: string
    unitPriceTry?: number
  }
  if (!body.constructionSiteId || !body.materialType) {
    res.status(400).json({ success: false, message: 'Eksik alan' })
    return
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const setRes = await client.query<{ id: string }>(
      `INSERT INTO sample_sets
         (tenant_id, construction_site_id, material_type, yif_no, concrete_class, status, internal_qr_code, assigned_to, unit_price_try)
       VALUES ($1,$2,$3,$4,$5,'created', $6, $7, $8) RETURNING id`,
      [req.tenantId, body.constructionSiteId, body.materialType, body.yifNo, body.concreteClass ?? null, crypto.randomUUID(), body.assignedTo ?? null, body.unitPriceTry || 0],
    )
    const setId = setRes.rows[0].id
    if (body.materialType === MaterialType.CONCRETE) {
      const targets = [7, 28]
      const specimens: Array<[number, number, string]> = []
      let specimenIndex = 1
      for (const age of targets) {
        const testDate = new Date()
        testDate.setDate(testDate.getDate() + age)
        for (let n = 1; n <= 3; n++) {
          specimens.push([specimenIndex++, age, testDate.toISOString().slice(0, 10)])
        }
      }
      for (const [no, age, date] of specimens) {
        await client.query(
          `INSERT INTO specimens (sample_set_id, specimen_no, target_age_days, target_test_date, internal_qr_code)
           VALUES ($1,$2,$3,$4,$5)`,
          [setId, no, age, date, crypto.randomUUID()],
        )
      }
    }
    await client.query('COMMIT')
    res.status(201).json({ success: true, data: { id: setId } })
  } catch (err) {
    await client.query('ROLLBACK')
    logger.error('createSampleSet failed', { err })
    res.status(500).json({ success: false, message: 'Oluşturulamadı' })
  } finally {
    client.release()
  }
}

export async function transition(req: Request, res: Response): Promise<void> {
  if (!req.user || !req.tenantId) {
    res.status(401).json({ success: false, message: 'Yetkilendirme gerekli' })
    return
  }
  const user = req.user
  const tenantId = req.tenantId
  const sampleSetId = req.params.id as string
  const { toStatus, payload } = req.body as {
    toStatus: SampleStatus
    payload?: {
      gps?: { lat: number; lng: number; accuracyM?: number }
      managerBypassToken?: string
      ebisProtocolNo?: string
      ebisFisNo?: string
      curingPoolZoneId?: string
      equipmentId?: string
      notes?: string
      curingEndedAt?: string
      [k: string]: unknown
    }
  }

  if (toStatus === SampleStatus.COLLECTED && payload?.gps) {
    const gps = payload.gps
    const setR = await pool.query<{ latitude: number; longitude: number; geofence_radius_m: number }>(
      `SELECT cs.latitude, cs.longitude, cs.geofence_radius_m
         FROM sample_sets ss JOIN construction_sites cs ON cs.id = ss.construction_site_id
        WHERE ss.id = $1 AND ss.tenant_id = $2`,
      [sampleSetId, tenantId],
    )
    const site = setR.rows[0]
    if (site) {
      const check = validateGeofence(
        { lat: gps.lat, lng: gps.lng },
        { lat: Number(site.latitude), lng: Number(site.longitude) },
        site.geofence_radius_m,
      )
      payload.geofenceValid = check.valid
      ;(payload as Record<string, unknown>).geofenceDistanceM = check.distanceM

      if (!check.valid) {
        const providedToken = typeof payload.managerBypassToken === 'string' ? payload.managerBypassToken.trim() : ''
        const bypassCheck = await pool.query(
          `SELECT 1 FROM bypass_requests 
           WHERE sample_set_id = $1 AND status = 'approved'
             AND (token = $2 OR $2 = '')`,
          [sampleSetId, providedToken]
        )
        const hasApprovedBypass = bypassCheck.rows[0] !== undefined

        if (!hasApprovedBypass) {
          const existingRequest = await pool.query<{ token: string }>(
            `SELECT token FROM bypass_requests WHERE sample_set_id = $1 AND status = 'pending'`,
            [sampleSetId]
          )
          let tokenCode = ''
          if (existingRequest.rows[0]) {
            tokenCode = existingRequest.rows[0].token
          } else {
            tokenCode = 'BP-' + Math.random().toString(36).substring(2, 6).toUpperCase()
            await pool.query(
              `INSERT INTO bypass_requests (tenant_id, sample_set_id, requested_by, distance_m, threshold_m, token, status)
               VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
              [tenantId, sampleSetId, user.userId, Math.round(check.distanceM), check.thresholdM, tokenCode]
            )
          }

          res.status(403).json({
            success: false,
            code: 'OUT_OF_BOUNDS',
            message: `Şantiye Dışı Giriş: kişi şantiye alanı dışında (${check.distanceM}m > ${check.thresholdM}m). Yönetici bypass onayı zorunludur.`,
            geofence: { ...check, token: tokenCode },
          })
          return
        }
        payload.geofenceOverride = true
        payload.geofenceValid = false
      }
    }
  }

  try {
    const result = await transitionSampleSet(
      { sampleSetId: sampleSetId, toStatus, payload },
      {
        tenantId,
        userId: user.userId,
        ipAddress: req.ip ?? '0.0.0.0',
        userAgent: req.headers['user-agent'] ?? '',
      },
    )
    res.json({ success: true, data: result })
  } catch (err) {
    if (err instanceof StateMachineError) {
      res.status(409).json({ success: false, message: err.message, code: 'INVALID_TRANSITION' })
      return
    }
    if (err instanceof SlaViolationError) {
      res.status(422).json({ success: false, message: err.message, code: err.violationType })
      return
    }
    if (err instanceof EbisValidationError) {
      res.status(422).json({ success: false, message: err.message, code: 'INVALID_EBIS_FORMAT', field: err.field })
      return
    }
    logger.error('transition failed', { err })
    res.status(500).json({ success: false, message: 'Geçiş başarısız' })
  }
}

export async function addSignature(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false, message: 'Tenant gerekli' }); return }
  const { role, fullName, tcKimlikNo, signatureSvg } = req.body as {
    role: StakeholderRole; fullName: string; tcKimlikNo?: string; signatureSvg: string
  }
  if (!role || !fullName || !signatureSvg) {
    res.status(400).json({ success: false, message: 'Eksik alan' })
    return
  }
  const own = await pool.query(`SELECT 1 FROM sample_sets WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.tenantId])
  if (!own.rows[0]) {
    res.status(403).json({ success: false, message: 'Bu numune seti tenantınıza ait değil' })
    return
  }
  await pool.query(
    `INSERT INTO stakeholder_signatures (sample_set_id, role, full_name, tc_kimlik_no, signature_svg)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (sample_set_id, role)
     DO UPDATE SET full_name = EXCLUDED.full_name, tc_kimlik_no = EXCLUDED.tc_kimlik_no,
                   signature_svg = EXCLUDED.signature_svg, signed_at = NOW()`,
    [req.params.id, role, fullName, tcKimlikNo ?? null, signatureSvg],
  )
  res.status(201).json({ success: true })
}

export async function getAudit(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false, message: 'Tenant gerekli' }); return }
  const r = await pool.query(
    `SELECT id, user_id, action, field_name, old_value, new_value, ip_address, created_at
       FROM audit_logs
      WHERE entity_type = 'sample_set' AND entity_id = $1 AND tenant_id = $2
      ORDER BY created_at DESC LIMIT 200`,
    [req.params.id, req.tenantId],
  )
  res.json({ success: true, data: r.rows })
}

export async function assignSampleSet(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false, message: 'Tenant gerekli' }); return }
  const { assigneeId } = req.body as { assigneeId: string | null }
  
  if (assigneeId) {
    const userCheck = await pool.query('SELECT 1 FROM users WHERE id = $1 AND tenant_id = $2', [assigneeId, req.tenantId])
    if (!userCheck.rows[0]) {
      res.status(400).json({ success: false, message: 'Geçersiz çalışan seçimi' })
      return
    }
  }
  
  const own = await pool.query('SELECT 1 FROM sample_sets WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId])
  if (!own.rows[0]) {
    res.status(403).json({ success: false, message: 'Bu numune seti tenantınıza ait değil' })
    return
  }
  
  await pool.query(
    `UPDATE sample_sets SET assigned_to = $1, updated_at = NOW() WHERE id = $2`,
    [assigneeId || null, req.params.id],
  )
  
  res.json({ success: true, message: 'İş başarıyla atandı' })
}

export async function listConstructionSites(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false, message: 'Tenant gerekli' }); return }
  const r = await pool.query(
    `SELECT id, name, yif_no, address, concrete_class, latitude, longitude, contractor_name, inspection_firm, ready_mix_supplier, santiye_sorumlusu_cep, is_active, created_at FROM construction_sites WHERE tenant_id = $1 AND is_active = true ORDER BY name`,
    [req.tenantId],
  )
  res.json({ success: true, data: r.rows })
}

export async function acceptSampleSet(req: Request, res: Response): Promise<void> {
  if (!req.tenantId || !req.user) { res.status(401).json({ success: false, message: 'Yetkisiz erişim' }); return }
  
  const setRes = await pool.query<{ assigned_to: string }>(
    `SELECT assigned_to FROM sample_sets WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.tenantId]
  )
  const sampleSet = setRes.rows[0]
  if (!sampleSet) {
    res.status(404).json({ success: false, message: 'Bulunamadı' })
    return
  }

  if (sampleSet.assigned_to && sampleSet.assigned_to !== req.user.userId && !['owner', 'manager', 'admin'].includes(req.user.role)) {
    res.status(403).json({ success: false, message: 'Bu görev size atanmamış' })
    return
  }

  await pool.query(
    `UPDATE sample_sets SET is_accepted = TRUE, accepted_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [req.params.id]
  )
  res.json({ success: true, message: 'Görev başarıyla kabul edildi' })
}

export async function createConstructionSite(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false, message: 'Tenant gerekli' }); return }
  const { name, yifNo, address, latitude, longitude, contractorName, inspectionFirm, readyMixSupplier, concreteClass, santiyeSorumlusuCep } = req.body as {
    name: string
    yifNo: string
    address: string
    latitude?: number
    longitude?: number
    contractorName?: string
    inspectionFirm?: string
    readyMixSupplier?: string
    concreteClass?: string
    santiyeSorumlusuCep?: string
  }

  if (!name || !yifNo || !address) {
    res.status(400).json({ success: false, message: 'Ad, YİF No ve Adres alanları zorunludur' })
    return
  }

  const lat = latitude !== undefined && latitude !== null ? Number(latitude) : 39.9208
  const lng = longitude !== undefined && longitude !== null ? Number(longitude) : 32.8540

  const r = await pool.query(
    `INSERT INTO construction_sites
     (tenant_id, name, yif_no, address, latitude, longitude, contractor_name, inspection_firm, ready_mix_supplier, concrete_class, santiye_sorumlusu_cep)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [req.tenantId, name, yifNo, address, lat, lng, contractorName || null, inspectionFirm || null, readyMixSupplier || null, concreteClass || null, santiyeSorumlusuCep || null]
  )

  res.status(201).json({ success: true, data: r.rows[0] })
}

export async function listBypassRequests(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false, message: 'Tenant gerekli' }); return }
  const r = await pool.query(
    `SELECT br.*, ss.yif_no, cs.name AS site_name, u.full_name AS requester_name
       FROM bypass_requests br
       JOIN sample_sets ss ON ss.id = br.sample_set_id
       JOIN construction_sites cs ON cs.id = ss.construction_site_id
       JOIN users u ON u.id = br.requested_by
      WHERE br.tenant_id = $1 AND br.status = 'pending'
      ORDER BY br.created_at DESC`,
    [req.tenantId]
  )
  res.json({ success: true, data: r.rows })
}

export async function approveBypassRequest(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false, message: 'Tenant gerekli' }); return }
  if (req.user?.role !== 'owner' && req.user?.role !== 'manager' && req.user?.role !== 'admin') {
    res.status(403).json({ success: false, message: 'Yönetici yetkisi gerekli' })
    return
  }
  
  const requestId = req.params.id
  await pool.query(
    `UPDATE bypass_requests SET status = 'approved', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
    [requestId, req.tenantId]
  )
  res.json({ success: true, message: 'Bypass onaylandı' })
}

export async function updateConstructionSite(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false, message: 'Tenant gerekli' }); return }
  const { id } = req.params
  const { name, yifNo, address, latitude, longitude, contractorName, inspectionFirm, readyMixSupplier, concreteClass, santiyeSorumlusuCep } = req.body as {
    name: string
    yifNo: string
    address: string
    latitude?: number
    longitude?: number
    contractorName?: string
    inspectionFirm?: string
    readyMixSupplier?: string
    concreteClass?: string
    santiyeSorumlusuCep?: string
  }

  if (!name || !yifNo || !address) {
    res.status(400).json({ success: false, message: 'Ad, YİF No ve Adres alanları zorunludur' })
    return
  }

  const lat = latitude !== undefined && latitude !== null ? Number(latitude) : 39.9208
  const lng = longitude !== undefined && longitude !== null ? Number(longitude) : 32.8540

  const r = await pool.query(
    `UPDATE construction_sites
        SET name = $1, yif_no = $2, address = $3, latitude = $4, longitude = $5,
            contractor_name = $6, inspection_firm = $7, ready_mix_supplier = $8, concrete_class = $9,
            santiye_sorumlusu_cep = $10, updated_at = NOW()
      WHERE id = $11 AND tenant_id = $12
      RETURNING *`,
    [name, yifNo, address, lat, lng, contractorName || null, inspectionFirm || null, readyMixSupplier || null, concreteClass || null, santiyeSorumlusuCep || null, id, req.tenantId]
  )

  if (!r.rows[0]) {
    res.status(404).json({ success: false, message: 'Şantiye bulunamadı' })
    return
  }

  res.json({ success: true, data: r.rows[0] })
}
