import type { Request, Response } from 'express'
import { pool } from '@/config/database.js'
import { extractEbisReceipt } from '@/services/ocr/ocr-service.js'
import { validateGeofence } from '@/services/geofence/geofence.js'
import { logger } from '@/utils/logger.js'
import { transitionSampleSet } from '@/services/state-machine/state-machine.js'
import { SampleStatus } from '@shared/types/enums'

export async function createFieldCollection(req: Request, res: Response): Promise<void> {
  if (!req.user || !req.tenantId) { res.status(401).json({ success: false }); return }
  const body = req.body as {
    sampleSetId: string
    gps: { lat: number; lng: number; accuracyM?: number }
    photos?: string[]
    ocrText?: string
    syncStatus?: 'pending' | 'synced' | 'failed'
  }
  const setR = await pool.query<{ latitude: number; longitude: number; geofence_radius_m: number }>(
    `SELECT cs.latitude, cs.longitude, cs.geofence_radius_m
       FROM sample_sets ss JOIN construction_sites cs ON cs.id = ss.construction_site_id
      WHERE ss.id = $1 AND ss.tenant_id = $2`,
    [body.sampleSetId, req.tenantId],
  )
  const site = setR.rows[0]
  if (!site) { res.status(404).json({ success: false, message: 'Şantiye bulunamadı' }); return }

  const geo = validateGeofence(
    { lat: body.gps.lat, lng: body.gps.lng },
    { lat: Number(site.latitude), lng: Number(site.longitude) },
    site.geofence_radius_m,
  )

  await pool.query(
    `INSERT INTO field_collections
       (sample_set_id, collected_by, gps_lat, gps_lng, gps_accuracy_m, geofence_valid, photos, ocr_raw_text, sync_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      body.sampleSetId, req.user.userId, body.gps.lat, body.gps.lng,
      body.gps.accuracyM ?? null, geo.valid,
      JSON.stringify(body.photos ?? []), body.ocrText ?? null,
      geo.valid ? (body.syncStatus ?? 'synced') : 'failed',
    ],
  )
  res.status(201).json({
    success: true,
    data: { geofence: geo, requiresManagerBypass: !geo.valid },
  })
}

export async function validateGeofenceEndpoint(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false }); return }
  const { siteId, lat, lng } = req.body as { siteId: string; lat: number; lng: number }
  const r = await pool.query<{ latitude: number; longitude: number; geofence_radius_m: number }>(
    `SELECT latitude, longitude, geofence_radius_m FROM construction_sites WHERE id = $1 AND tenant_id = $2`,
    [siteId, req.tenantId],
  )
  const site = r.rows[0]
  if (!site) { res.status(404).json({ success: false }); return }
  const result = validateGeofence(
    { lat, lng },
    { lat: Number(site.latitude), lng: Number(site.longitude) },
    site.geofence_radius_m,
  )
  res.json({ success: true, data: result })
}

export async function ocrReceipt(req: Request, res: Response): Promise<void> {
  if (!req.file) { res.status(400).json({ success: false, message: 'Görsel gerekli' }); return }
  try {
    const result = await extractEbisReceipt(req.file.buffer)
    res.json({ success: true, data: result })
  } catch (err) {
    logger.error('OCR failed', { err })
    res.status(500).json({ success: false, message: 'OCR başarısız' })
  }
}

export async function bulkSync(req: Request, res: Response): Promise<void> {
  if (!req.user || !req.tenantId) { res.status(401).json({ success: false }); return }
  const { operations } = req.body as { operations: Array<{ idempotencyKey: string; entityType: string; payload: Record<string, any> }> }
  if (!Array.isArray(operations)) { res.status(400).json({ success: false }); return }
  const results: Array<{ idempotencyKey: string; success: boolean; error?: string }> = []
  for (const op of operations) {
    const dup = await pool.query(`SELECT id FROM sync_queue WHERE idempotency_key = $1`, [op.idempotencyKey])
    if (dup.rowCount && dup.rowCount > 0) {
      results.push({ idempotencyKey: op.idempotencyKey, success: true })
      continue
    }
    try {
      if (op.entityType === 'field_collection') {
        const payload = op.payload
        const { sampleSetId, gps, photos, ocrText, ebisProtocolNo, ebisFisNo, concreteClass } = payload
        
        const setR = await pool.query<{ latitude: number; longitude: number; geofence_radius_m: number }>(
          `SELECT cs.latitude, cs.longitude, cs.geofence_radius_m
             FROM sample_sets ss JOIN construction_sites cs ON cs.id = ss.construction_site_id
            WHERE ss.id = $1 AND ss.tenant_id = $2`,
          [sampleSetId, req.tenantId],
        )
        const site = setR.rows[0]
        if (!site) {
          throw new Error('Şantiye bulunamadı')
        }

        const geo = validateGeofence(
          { lat: gps.lat, lng: gps.lng },
          { lat: Number(site.latitude), lng: Number(site.longitude) },
          site.geofence_radius_m,
        )

        await pool.query(
          `INSERT INTO field_collections
             (sample_set_id, collected_by, gps_lat, gps_lng, gps_accuracy_m, geofence_valid, photos, ocr_raw_text, sync_status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            sampleSetId, req.user.userId, gps.lat, gps.lng,
            gps.accuracyM ?? null, geo.valid,
            JSON.stringify(photos ?? []), ocrText ?? null,
            'synced'
          ],
        )

        await transitionSampleSet(
          {
            sampleSetId,
            toStatus: SampleStatus.COLLECTED,
            payload: {
              gps,
              geofenceValid: geo.valid,
              geofenceOverride: !geo.valid,
              ebisProtocolNo,
              ebisFisNo,
              concreteClass,
            }
          },
          {
            tenantId: req.tenantId,
            userId: req.user.userId,
            ipAddress: req.ip ?? '0.0.0.0',
            userAgent: req.headers['user-agent'] ?? 'offline-sync',
          }
        )
      }

      await pool.query(
        `INSERT INTO sync_queue (tenant_id, user_id, operation, entity_type, payload, idempotency_key, status)
         VALUES ($1,$2,'create',$3,$4,$5,'synced')`,
        [req.tenantId, req.user.userId, op.entityType, JSON.stringify(op.payload), op.idempotencyKey],
      )
      results.push({ idempotencyKey: op.idempotencyKey, success: true })
    } catch (err: any) {
      logger.error('sync failed', { err: err?.message, op })
      try {
        await pool.query(
          `INSERT INTO sync_queue (tenant_id, user_id, operation, entity_type, payload, idempotency_key, status, error_message)
           VALUES ($1,$2,'create',$3,$4,$5,'failed',$6)`,
          [req.tenantId, req.user.userId, op.entityType, JSON.stringify(op.payload), op.idempotencyKey, err?.message || String(err)],
        )
      } catch (innerErr) {
        logger.error('failed to record failed sync to queue', { innerErr })
      }
      results.push({ idempotencyKey: op.idempotencyKey, success: false, error: err?.message || String(err) })
    }
  }
  res.json({ success: true, data: results })
}
