import type { Request, Response } from 'express'
import { pool } from '@/config/database.js'

export async function listEquipment(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false }); return }
  const r = await pool.query(
    `SELECT * FROM equipment WHERE tenant_id = $1 ORDER BY name`,
    [req.tenantId],
  )
  res.json({ success: true, data: r.rows })
}

export async function createEquipment(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false }); return }
  const { name, serialNumber, equipmentType, calibrationDate, calibrationExpiryDate, manufacturer } = req.body as {
    name: string; serialNumber: string; equipmentType: string;
    calibrationDate: string; calibrationExpiryDate: string; manufacturer?: string;
  }
  const r = await pool.query(
    `INSERT INTO equipment (tenant_id, name, serial_number, equipment_type, calibration_date, calibration_expiry_date, manufacturer)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.tenantId, name, serialNumber, equipmentType, calibrationDate, calibrationExpiryDate, manufacturer ?? null],
  )
  res.status(201).json({ success: true, data: r.rows[0] })
}

export async function recalibrate(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false }); return }
  const { calibrationDate, calibrationExpiryDate } = req.body as { calibrationDate: string; calibrationExpiryDate: string }
  const r = await pool.query(
    `UPDATE equipment
        SET calibration_date = $1, calibration_expiry_date = $2,
            is_calibrated = (calibration_expiry_date >= CURRENT_DATE),
            is_blocked = (calibration_expiry_date < CURRENT_DATE)
      WHERE id = $3 AND tenant_id = $4
      RETURNING *`,
    [calibrationDate, calibrationExpiryDate, req.params.id, req.tenantId],
  )
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
