import type { Request, Response } from 'express'
import crypto from 'node:crypto'
import { pool } from '@/config/database.js'
import type { JwtPayload } from '@/middleware/auth.js'
import { generateReportPdf, type ReportData } from '@/services/pdf/pdf-generator.js'
import { calculatePacal } from '@/services/calculations/formula-calculator.js'
import { recordAudit } from '@/utils/audit.js'
import { logger } from '@/utils/logger.js'
import path from 'path'
import fs from 'fs'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads/reports'

function canGenerateReport(role: string): boolean {
  return ['owner', 'manager', 'qc_engineer', 'lab_technician', 'admin'].includes(role)
}

function safeReportName(reportNumber: string): string {
  // Sadece güvenli karakter bırak; .., /, \ engelle
  const base = path.basename(reportNumber).replace(/[^A-Za-z0-9._-]/g, '_')
  if (!base || base.includes('..')) {
    throw new Error('Geçersiz rapor numarası')
  }
  return base
}

export async function generate(req: Request, res: Response): Promise<void> {
  if (!(req.user as JwtPayload) || !req.tenantId) { res.status(401).json({ success: false }); return }
  if (!canGenerateReport((req.user as JwtPayload).role)) {
    res.status(403).json({ success: false, message: 'Bu rapor üretme yetkiniz yok' })
    return
  }
  const body = req.body as { sampleSetId: string; reportType?: ReportData['reportType'] }
  if (!body.sampleSetId) {
    res.status(400).json({ success: false, message: 'sampleSetId zorunlu' })
    return
  }

  const setR = await pool.query(
    `SELECT ss.*, cs.name AS site_name, cs.address AS site_address, cs.yif_no,
            cs.contractor_name, cs.inspection_firm, cs.ready_mix_supplier, cs.property_owner,
            t.name AS tenant_name, t.tax_no, t.address AS tenant_address
       FROM sample_sets ss
       JOIN construction_sites cs ON cs.id = ss.construction_site_id
       JOIN tenants t ON t.id = ss.tenant_id
      WHERE ss.id = $1 AND ss.tenant_id = $2`,
    [body.sampleSetId, req.tenantId],
  )
  const set = setR.rows[0]
  if (!set) { res.status(404).json({ success: false, message: 'Numune seti bulunamadı' }); return }

  const specR = await pool.query(
    `SELECT * FROM specimens WHERE sample_set_id = $1 ORDER BY target_age_days, specimen_no`,
    [body.sampleSetId],
  )
  const sigR = await pool.query(
    `SELECT * FROM stakeholder_signatures WHERE sample_set_id = $1`,
    [body.sampleSetId],
  )
  const userR = await pool.query<{ full_name: string; role: string }>(
    `SELECT full_name, role FROM users WHERE id = $1`,
    [(req.user as JwtPayload).userId],
  )

  const pacalResults: Record<number, ReturnType<typeof calculatePacal> | null> = { 7: null, 28: null }
  for (const age of [7, 28] as const) {
    const subset = specR.rows.filter((s) => s.target_age_days === age && s.compressive_strength_mpa !== null)
    if (subset.length >= 2) {
      pacalResults[age] = calculatePacal(
        subset.map((s) => Number(s.compressive_strength_mpa)),
        subset.map((s) => s.specimen_no),
        age,
        set.concrete_class ?? 'C30/37',
      )
    }
  }

  const reportNumber = `${set.yif_no.replace(/[^A-Za-z0-9._-]/g, '_')}-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex')}`
  const data: ReportData = {
    reportNumber,
    reportType: body.reportType ?? 'fresh_concrete',
    generatedAt: new Date().toISOString(),
    tenant: { name: set.tenant_name, logoUrl: null, taxNo: set.tax_no, address: set.tenant_address },
    constructionSite: {
      yifNo: set.yif_no, name: set.site_name, address: set.site_address,
      contractor: set.contractor_name, inspectionFirm: set.inspection_firm,
      readyMixSupplier: set.ready_mix_supplier, propertyOwner: set.property_owner,
    },
    sampleSet: {
      ebisProtocolNo: set.ebis_protocol_no, ebisFisNo: set.ebis_fis_no,
      concreteClass: set.concrete_class, castingDate: set.casting_date,
      castingLocation: null, slumpCm: set.slump_value_cm,
      concreteTempC: set.concrete_temp_c, airTempC: set.air_temp_c,
    },
    specimens: specR.rows.map((s) => ({
      specimenNo: s.specimen_no, ageDays: s.target_age_days,
      testDate: s.actual_test_date,
      dimensions: s.diameter_mm ? `Ø${s.diameter_mm}x${s.height_mm}` : `${s.width_mm}x${s.height_mm}`,
      weightGr: s.weight_gr, densityKgM3: s.density_kg_m3,
      loadKn: s.failure_load_kn ? Number(s.failure_load_kn) : null,
      strengthMpa: s.compressive_strength_mpa ? Number(s.compressive_strength_mpa) : null,
    })),
    pacal7: pacalResults[7] ? { mean: pacalResults[7]!.meanMpa, stdDev: pacalResults[7]!.stdDeviationMpa, characteristic: pacalResults[7]!.characteristicMpa, passes: pacalResults[7]!.passesTsEn206 } : undefined,
    pacal28: pacalResults[28] ? { mean: pacalResults[28]!.meanMpa, stdDev: pacalResults[28]!.stdDeviationMpa, characteristic: pacalResults[28]!.characteristicMpa, passes: pacalResults[28]!.passesTsEn206 } : undefined,
    signatures: sigR.rows.map((s) => ({ role: s.role, fullName: s.full_name, signedAt: s.signed_at, signatureSvg: s.signature_svg })),
    approvers: {
      qcEngineer: { name: userR.rows[0]?.full_name ?? 'Onay Bekleniyor', title: 'Kalite Kontrol Mühendisi' },
      labManager: { name: 'Laboratuvar Müdürü', title: 'Laboratuvar Müdürü' },
    },
    verificationUrl: `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/verify/${reportNumber}`,
  }

  try {
    const buffer = await generateReportPdf(data)
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })
    // Tenant klasörü altında (cross-tenant dosya izolasyonu)
    const tenantDir = path.join(UPLOAD_DIR, req.tenantId)
    if (!fs.existsSync(tenantDir)) fs.mkdirSync(tenantDir, { recursive: true })
    const safeName = safeReportName(reportNumber)
    const filePath = path.join(tenantDir, `${safeName}.pdf`)
    const resolved = path.resolve(filePath)
    if (!resolved.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) {
      throw new Error('Path traversal engellendi')
    }
    await fs.promises.writeFile(filePath, buffer)
    const ins = await pool.query(
      `INSERT INTO reports (tenant_id, sample_set_id, report_type, report_number, pdf_url, generated_by, verification_qr)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.tenantId, body.sampleSetId, data.reportType, reportNumber, resolved, (req.user as JwtPayload).userId, data.verificationUrl],
    )
    const client = await pool.connect()
    try {
      await recordAudit(client, {
        tenantId: req.tenantId, userId: (req.user as JwtPayload).userId, entityType: 'report', entityId: ins.rows[0].id,
        action: 'INSERT', fieldName: 'report_number', newValue: reportNumber,
        ipAddress: req.ip ?? '0.0.0.0', userAgent: req.headers['user-agent'] ?? '',
      })
    } finally { client.release() }
    res.status(201).json({ success: true, data: { ...ins.rows[0], sizeBytes: buffer.length } })
  } catch (err) {
    logger.error('PDF generation failed', { err: err instanceof Error ? { message: err.message, code: (err as { code?: string }).code } : err })
    res.status(500).json({ success: false, message: 'PDF oluşturulamadı' })
  }
}

export async function getPdf(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false }); return }
  if (!canGenerateReport(req.user?.role ?? '')) {
    res.status(403).json({ success: false, message: 'Bu rapor indirme yetkiniz yok' })
    return
  }
  const r = await pool.query(
    `SELECT * FROM reports WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.tenantId],
  )
  const rep = r.rows[0]
  if (!rep || !fs.existsSync(rep.pdf_url)) { res.status(404).json({ success: false }); return }
  const resolved = path.resolve(rep.pdf_url)
  if (!resolved.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) {
    res.status(400).json({ success: false, message: 'Geçersiz dosya yolu' })
    return
  }
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="${safeReportName(rep.report_number)}.pdf"`)
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  res.setHeader('X-Robots-Tag', 'noindex')
  fs.createReadStream(resolved).pipe(res)
}

export async function batchGenerate(req: Request, res: Response): Promise<void> {
  if (!(req.user as JwtPayload) || !req.tenantId) { res.status(400).json({ success: false }); return }
  if (!canGenerateReport((req.user as JwtPayload).role)) {
    res.status(403).json({ success: false, message: 'Bu rapor üretme yetkiniz yok' })
    return
  }
  const { sampleSetIds } = req.body as { sampleSetIds: string[] }
  if (!Array.isArray(sampleSetIds) || sampleSetIds.length === 0) {
    res.status(400).json({ success: false, message: 'sampleSetIds gerekli' })
    return
  }
  if (sampleSetIds.length > 50) {
    res.status(400).json({ success: false, message: 'Tek seferde en fazla 50 rapor üretilebilir' })
    return
  }
  const results: Array<{ sampleSetId: string; reportId?: string; error?: string }> = []
  for (const id of sampleSetIds) {
    const fakeReq = { ...req, body: { sampleSetId: id } } as unknown as Request
    const result = { sampleSetId: id, reportId: undefined as string | undefined, error: undefined as string | undefined }
    const fakeRes = {
      status: (code: number) => { if (code >= 400) result.error = `HTTP ${code}`; return fakeRes },
      json: (b: { success: boolean; data?: { id: string }; message?: string }) => {
        if (b?.success && b.data?.id) result.reportId = b.data.id
        else if (!b?.success) result.error = b?.message ?? 'failed'
        return fakeRes
      },
    } as unknown as Response
    try {
      await generate(fakeReq, fakeRes)
    } catch (err) {
      result.error = 'exception'
      logger.error('batchGenerate item failed', { err: err instanceof Error ? { message: err.message } : err, sampleSetId: id })
    }
    results.push(result)
  }
  const succeeded = results.filter((r) => r.reportId).length
  const failed = results.length - succeeded
  res.json({
    success: failed === 0,
    data: { items: results, summary: { total: results.length, succeeded, failed } },
  })
}

export async function verifyReport(req: Request, res: Response): Promise<void> {
  const { reportNumber } = req.params
  if (!reportNumber) { res.status(400).json({ success: false, message: 'Rapor numarası gerekli' }); return }
  const r = await pool.query(
    `SELECT r.report_number, r.report_type, r.generated_at, r.verification_qr,
            r.sample_set_id, r.tenant_id,
            t.name AS tenant_name, t.slug AS tenant_slug
       FROM reports r
       JOIN tenants t ON t.id = r.tenant_id
      WHERE r.report_number = $1`,
    [reportNumber],
  )
  if (!r.rows[0]) { res.status(404).json({ success: false, message: 'Rapor bulunamadı' }); return }
  res.json({ success: true, data: r.rows[0] })
}
