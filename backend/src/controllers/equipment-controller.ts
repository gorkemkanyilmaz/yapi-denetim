import type { Request, Response } from 'express'
import { pool } from '@/config/database.js'
import type { JwtPayload } from '@/middleware/auth.js'
import { recordAudit } from '@/utils/audit.js'
import { logger } from '@/utils/logger.js'

function canManageEquipment(role: string): boolean {
  return ['owner', 'manager', 'qc_engineer', 'admin'].includes(role)
}

export async function listEquipment(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false }); return }
  const r = await pool.query(
    `SELECT * FROM equipment WHERE tenant_id = $1 ORDER BY name`,
    [req.tenantId],
  )
  res.json({ success: true, data: r.rows })
}

export async function createEquipment(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false, message: 'Tenant gerekli' }); return }
  if (!canManageEquipment(req.user?.role ?? '')) {
    res.status(403).json({ success: false, message: 'Bu işlem için yetkiniz yok' })
    return
  }
  const { name, serialNumber, equipmentType, calibrationDate, calibrationExpiryDate, manufacturer } = req.body as {
    name: string; serialNumber: string; equipmentType: string;
    calibrationDate: string; calibrationExpiryDate: string; manufacturer?: string;
  }
  if (!name || !serialNumber || !equipmentType || !calibrationDate || !calibrationExpiryDate) {
    res.status(400).json({ success: false, message: 'Eksik alan' })
    return
  }
  if (new Date(calibrationExpiryDate) <= new Date(calibrationDate)) {
    res.status(400).json({ success: false, message: 'Bitiş tarihi, başlangıçtan sonra olmalı' })
    return
  }
  try {
    const r = await pool.query(
      `INSERT INTO equipment (tenant_id, name, serial_number, equipment_type, calibration_date, calibration_expiry_date, manufacturer)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.tenantId, name, serialNumber, equipmentType, calibrationDate, calibrationExpiryDate, manufacturer ?? null],
    )
    const client = await pool.connect()
    try {
      await recordAudit(client, {
        tenantId: req.tenantId, userId: (req.user as JwtPayload).userId, entityType: 'equipment', entityId: r.rows[0].id,
        action: 'INSERT', fieldName: 'name', newValue: name,
        ipAddress: req.ip ?? '0.0.0.0', userAgent: req.headers['user-agent'] ?? '',
      })
    } finally { client.release() }
    res.status(201).json({ success: true, data: r.rows[0] })
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === '23505') {
      res.status(409).json({ success: false, message: 'Bu seri numarası zaten kayıtlı' })
    } else {
      logger.error('createEquipment failed', { err: err instanceof Error ? { message: err.message, code } : err })
      res.status(500).json({ success: false, message: 'Cihaz oluşturulamadı' })
    }
  }
}

export async function recalibrate(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false, message: 'Tenant gerekli' }); return }
  if (!canManageEquipment(req.user?.role ?? '')) {
    res.status(403).json({ success: false, message: 'Bu işlem için yetkiniz yok' })
    return
  }
  const { calibrationDate, calibrationExpiryDate } = req.body as { calibrationDate: string; calibrationExpiryDate: string }
  if (new Date(calibrationExpiryDate) <= new Date(calibrationDate)) {
    res.status(400).json({ success: false, message: 'Bitiş tarihi, başlangıçtan sonra olmalı' })
    return
  }
  // Trigger otomatik hesaplar (is_calibrated, is_blocked); recalibration sonrası
  const r = await pool.query(
    `UPDATE equipment
        SET calibration_date = $1, calibration_expiry_date = $2, is_calibrated = TRUE, is_blocked = FALSE
      WHERE id = $3 AND tenant_id = $4
      RETURNING *`,
    [calibrationDate, calibrationExpiryDate, req.params.id, req.tenantId],
  )
  if (!r.rows[0]) {
    res.status(404).json({ success: false, message: 'Cihaz bulunamadı' })
    return
  }
  const client = await pool.connect()
  try {
      await recordAudit(client, {
        tenantId: req.tenantId, userId: (req.user as JwtPayload).userId, entityType: 'equipment', entityId: req.params.id as string,
        action: 'UPDATE', fieldName: 'calibration_expiry_date', newValue: calibrationExpiryDate,
      ipAddress: req.ip ?? '0.0.0.0', userAgent: req.headers['user-agent'] ?? '',
    })
  } finally { client.release() }
  res.json({ success: true, data: r.rows[0] })
}

export async function expiringEquipment(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false }); return }
  const r = await pool.query(
    `SELECT * FROM equipment
      WHERE tenant_id = $1
        AND calibration_expiry_date <= CURRENT_DATE + INTERVAL '30 days'
      ORDER BY calibration_expiry_date ASC`,
    [req.tenantId],
  )
  res.json({ success: true, data: r.rows })
}
