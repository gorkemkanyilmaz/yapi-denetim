import type { Request, Response } from 'express'
import { pool } from '@/config/database.js'
import { HakedisStatus } from '@shared/types/enums'
import { logger } from '@/utils/logger.js'

export async function listHakedis(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false }); return }
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
  const body = req.body as {
    constructionSiteId: string
    periodStart: string
    periodEnd: string
    unitPriceTry: number
    vatRate?: number
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
  const vatRate = body.vatRate ?? 20
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
  res.status(201).json({ success: true, data: r.rows[0] })
}

export async function updateHakedisStatus(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false }); return }
  const { status, invoiceNo } = req.body as { status: HakedisStatus; invoiceNo?: string }
  const r = await pool.query(
    `UPDATE hakedis
        SET status = $1,
            invoice_no = COALESCE($2, invoice_no)
      WHERE id = $3 AND tenant_id = $4
      RETURNING *`,
    [status, invoiceNo ?? null, req.params.id, req.tenantId],
  )
  if (!r.rows[0]) { res.status(404).json({ success: false }); return }
  res.json({ success: true, data: r.rows[0] })
}

export async function exportHakedis(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false }); return }
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
    res.setHeader('Content-Disposition', `attachment; filename="hakedis-${h.id}.xml"`)
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eFatura>
  <Satici><VKN>${h.tax_no}</VKN><Unvan>${h.tenant_name}</Unvan></Satici>
  <Alici><Unvan>${h.site_name}</Unvan></Alici>
  <FaturaNo>${h.invoice_no ?? ''}</FaturaNo>
  <Tarih>${new Date().toISOString().slice(0, 10)}</Tarih>
  <YIF>${h.yif_no}</YIF>
  <Kalem><Adet>${h.completed_samples}</Adet><BirimFiyat>${h.unit_price_try}</BirimFiyat><Tutar>${h.amount_try}</Tutar></Kalem>
  <KDV><Oran>${h.vat_rate}</Oran><Tutar>${h.vat_amount_try}</Tutar></KDV>
  <Toplam>${h.total_amount_try}</Toplam>
</eFatura>`
    res.send(xml)
  } catch (err) {
    logger.error('exportHakedis failed', { err })
    res.status(500).json({ success: false })
  }
}
