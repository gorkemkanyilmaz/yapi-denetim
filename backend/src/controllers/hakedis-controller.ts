import type { Request, Response } from 'express'
import { pool } from '@/config/database.js'
import type { JwtPayload } from '@/middleware/auth.js'
import { HakedisStatus, UserRole } from '@shared/types/enums'
import { recordAudit } from '@/utils/audit.js'
import { logger } from '@/utils/logger.js'

function xmlEscape(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function safeFilename(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80)
}

const HAKEDIS_STATUS_ORDER: HakedisStatus[] = [
  HakedisStatus.DRAFT, HakedisStatus.SUBMITTED, HakedisStatus.APPROVED,
  HakedisStatus.INVOICED, HakedisStatus.PAID,
]
const HAKEDIS_STATUS_BACKWARD_ALLOWED: Record<HakedisStatus, HakedisStatus[]> = {
  [HakedisStatus.DRAFT]: [],
  [HakedisStatus.SUBMITTED]: [HakedisStatus.DRAFT],
  [HakedisStatus.APPROVED]: [HakedisStatus.SUBMITTED],
  [HakedisStatus.INVOICED]: [HakedisStatus.APPROVED],
  [HakedisStatus.PAID]: [HakedisStatus.INVOICED],
}

export async function listHakedis(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false }); return }
  if (req.user?.role !== UserRole.OWNER && req.user?.role !== UserRole.MANAGER && req.user?.role !== UserRole.ADMIN) {
    res.status(403).json({ success: false, message: 'Bu listeyi görme yetkiniz yok' })
    return
  }
  const r = await pool.query(
    `SELECT h.*, cs.name AS construction_site_name, cs.yif_no
       FROM hakedis h
       JOIN construction_sites cs ON cs.id = h.construction_site_id
      WHERE h.tenant_id = $1
      ORDER BY h.period_end DESC`,
    [req.tenantId],
  )
  res.json({ success: true, data: r.rows })
}

export async function createHakedis(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false }); return }
  if (req.user?.role !== UserRole.OWNER && req.user?.role !== UserRole.MANAGER && req.user?.role !== UserRole.ADMIN) {
    res.status(403).json({ success: false, message: 'Bu işlem için yetkiniz yok' })
    return
  }
  const body = req.body as {
    constructionSiteId: string
    periodStart: string
    periodEnd: string
    unitPriceTry: number
    vatRate?: number
  }
  if (!body.constructionSiteId || !body.periodStart || !body.periodEnd) {
    res.status(400).json({ success: false, message: 'constructionSiteId, periodStart, periodEnd zorunlu' })
    return
  }
  if (new Date(body.periodEnd) < new Date(body.periodStart)) {
    res.status(400).json({ success: false, message: 'periodEnd, periodStart\'tan önce olamaz' })
    return
  }
  if (!body.unitPriceTry || body.unitPriceTry <= 0) {
    res.status(400).json({ success: false, message: 'unitPriceTry > 0 olmalı' })
    return
  }
  // Cross-tenant: construction_site_id bu tenant'a mı ait?
  const site = await pool.query<{ id: string }>(
    `SELECT id FROM construction_sites WHERE id = $1 AND tenant_id = $2`,
    [body.constructionSiteId, req.tenantId]
  )
  if (!site.rows[0]) {
    res.status(400).json({ success: false, message: 'Geçersiz şantiye (tenant uyumsuz)' })
    return
  }
  const samplesR = await pool.query<{ total: string; completed: string; sum_amount: string }>(
    `SELECT
       COUNT(*)::text AS total,
       COUNT(*) FILTER (WHERE status IN ('approved','archived'))::text AS completed,
       COALESCE(SUM(unit_price_try) FILTER (WHERE status IN ('approved','archived')), 0)::text AS sum_amount
     FROM sample_sets
     WHERE construction_site_id = $1 AND tenant_id = $2
       AND created_at::date BETWEEN $3 AND $4`,
    [body.constructionSiteId, req.tenantId, body.periodStart, body.periodEnd],
  )
  const total = Number(samplesR.rows[0]?.total ?? 0)
  const completed = Number(samplesR.rows[0]?.completed ?? 0)
  const sumAmount = Number(samplesR.rows[0]?.sum_amount ?? 0)

  const amount = sumAmount > 0 ? sumAmount : completed * body.unitPriceTry
  const vatRate = Math.min(100, Math.max(0, body.vatRate ?? 20))
  const vat = (amount * vatRate) / 100
  const totalAmount = amount + vat

  const r = await pool.query(
    `INSERT INTO hakedis
       (tenant_id, construction_site_id, period_start, period_end, total_samples, completed_samples,
        unit_price_try, amount_try, vat_rate, vat_amount_try, total_amount_try, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft') RETURNING *`,
    [req.tenantId, body.constructionSiteId, body.periodStart, body.periodEnd, total, completed,
      body.unitPriceTry, amount, vatRate, vat, totalAmount],
  )
  const client = await pool.connect()
  try {
    await recordAudit(client, {
      tenantId: req.tenantId, userId: (req.user as JwtPayload).userId, entityType: 'hakedis', entityId: r.rows[0].id,
      action: 'INSERT', fieldName: 'status', newValue: 'draft',
      ipAddress: req.ip ?? '0.0.0.0', userAgent: req.headers['user-agent'] ?? '',
    })
  } finally { client.release() }
  res.status(201).json({ success: true, data: r.rows[0] })
}

export async function updateHakedisStatus(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false }); return }
  if (req.user?.role !== UserRole.OWNER && req.user?.role !== UserRole.MANAGER && req.user?.role !== UserRole.ADMIN) {
    res.status(403).json({ success: false, message: 'Bu işlem için yetkiniz yok' })
    return
  }
  const { status, invoiceNo } = req.body as { status: HakedisStatus; invoiceNo?: string }
  if (!Object.values(HakedisStatus).includes(status)) {
    res.status(400).json({ success: false, message: 'Geçersiz durum' })
    return
  }
  // PAID sadece owner atayabilir
  if (status === HakedisStatus.PAID && (req.user as JwtPayload).role !== UserRole.OWNER) {
    res.status(403).json({ success: false, message: 'Sadece patron (owner) tahsil edildi olarak işaretleyebilir' })
    return
  }
  const cur = await pool.query<{ status: HakedisStatus }>(
    `SELECT status FROM hakedis WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.tenantId]
  )
  if (!cur.rows[0]) {
    res.status(404).json({ success: false, message: 'Hakediş bulunamadı' })
    return
  }
  const curStatus = cur.rows[0].status
  const curIdx = HAKEDIS_STATUS_ORDER.indexOf(curStatus)
  const newIdx = HAKEDIS_STATUS_ORDER.indexOf(status)
  const isForward = newIdx > curIdx
  const isAllowedBackward = HAKEDIS_STATUS_BACKWARD_ALLOWED[curStatus]?.includes(status)
  if (!isForward && !isAllowedBackward) {
    res.status(409).json({ success: false, message: `Geçersiz durum geçişi: ${curStatus} → ${status}` })
    return
  }
  const r = await pool.query(
    `UPDATE hakedis
        SET status = $1,
            invoice_no = COALESCE($2, invoice_no)
      WHERE id = $3 AND tenant_id = $4
      RETURNING *`,
    [status, invoiceNo ?? null, req.params.id, req.tenantId],
  )
  const client = await pool.connect()
  try {
    await recordAudit(client, {
      tenantId: req.tenantId, userId: (req.user as JwtPayload).userId, entityType: 'hakedis', entityId: req.params.id as string,
      action: 'UPDATE', fieldName: 'status', oldValue: curStatus, newValue: status,
      ipAddress: req.ip ?? '0.0.0.0', userAgent: req.headers['user-agent'] ?? '',
    })
  } finally { client.release() }
  res.json({ success: true, data: r.rows[0] })
}

export async function exportHakedis(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false }); return }
  if (req.user?.role !== UserRole.OWNER && req.user?.role !== UserRole.MANAGER && req.user?.role !== UserRole.ADMIN) {
    res.status(403).json({ success: false, message: 'Bu işlem için yetkiniz yok' })
    return
  }
  try {
    const r = await pool.query(
      `SELECT h.*, cs.name AS site_name, cs.yif_no, cs.address,
              t.name AS tenant_name, t.tax_no
         FROM hakedis h
         JOIN construction_sites cs ON cs.id = h.construction_site_id
         JOIN tenants t ON t.id = h.tenant_id
        WHERE h.id = $1 AND h.tenant_id = $2`,
      [req.params.id, req.tenantId],
    )
    const h = r.rows[0]
    if (!h) { res.status(404).json({ success: false }); return }
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="hakedis-${safeFilename(h.id)}.xml"`)
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eFatura>
  <Satici><VKN>${xmlEscape(h.tax_no)}</VKN><Unvan>${xmlEscape(h.tenant_name)}</Unvan></Satici>
  <Alici><Unvan>${xmlEscape(h.site_name)}</Unvan></Alici>
  <FaturaNo>${xmlEscape(h.invoice_no ?? '')}</FaturaNo>
  <Tarih>${new Date().toISOString().slice(0, 10)}</Tarih>
  <YIF>${xmlEscape(h.yif_no)}</YIF>
  <Kalem><Adet>${Number(h.completed_samples)}</Adet><BirimFiyat>${Number(h.unit_price_try).toFixed(2)}</BirimFiyat><Tutar>${Number(h.amount_try).toFixed(2)}</Tutar></Kalem>
  <KDV><Oran>${Number(h.vat_rate).toFixed(2)}</Oran><Tutar>${Number(h.vat_amount_try).toFixed(2)}</Tutar></KDV>
  <Toplam>${Number(h.total_amount_try).toFixed(2)}</Toplam>
</eFatura>`
    res.send(xml)
  } catch (err) {
    logger.error('exportHakedis failed', { err: err instanceof Error ? { message: err.message } : err })
    res.status(500).json({ success: false })
  }
}
