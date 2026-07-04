import type { Request, Response } from 'express'
import { pool } from '@/config/database.js'

export async function listPools(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false }); return }
  const r = await pool.query(
    `SELECT cp.*,
            (SELECT COUNT(*) FROM curing_pool_zones WHERE curing_pool_id = cp.id) AS zone_count,
            (SELECT COUNT(*) FROM curing_pool_zones WHERE curing_pool_id = cp.id AND is_occupied = TRUE) AS occupied_count,
            (SELECT MAX(zones_per_shelf) FROM (
              SELECT shelf_level, COUNT(*) AS zones_per_shelf
                FROM curing_pool_zones WHERE curing_pool_id = cp.id
              GROUP BY shelf_level
            ) sub) AS zones_per_shelf
       FROM curing_pools cp
      WHERE cp.tenant_id = $1
      ORDER BY cp.name`,
    [req.tenantId],
  )
  res.json({ success: true, data: r.rows })
}

export async function getZones(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false }); return }
  const r = await pool.query(
    `SELECT z.*, ss.ebis_protocol_no, ss.yif_no, ss.concrete_class
       FROM curing_pool_zones z
       LEFT JOIN sample_sets ss ON ss.id = z.current_sample_set_id
       JOIN curing_pools cp ON cp.id = z.curing_pool_id
      WHERE cp.id = $1 AND cp.tenant_id = $2
      ORDER BY z.shelf_level, z.zone_label`,
    [req.params.id, req.tenantId],
  )
  res.json({ success: true, data: r.rows })
}

export async function assignZone(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false }); return }
  const { sampleSetId } = req.body as { sampleSetId: string }
  const r = await pool.query(
    `UPDATE curing_pool_zones z
        SET is_occupied = TRUE, current_sample_set_id = $1
       FROM curing_pools cp
      WHERE z.id = $2 AND z.curing_pool_id = cp.id AND cp.tenant_id = $3
      RETURNING z.*`,
    [sampleSetId, req.params.zoneId, req.tenantId],
  )
  res.json({ success: true, data: r.rows[0] })
}

export async function releaseZone(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false }); return }
  await pool.query(
    `UPDATE curing_pool_zones z
        SET is_occupied = FALSE, current_sample_set_id = NULL
       FROM curing_pools cp
      WHERE z.id = $1 AND z.curing_pool_id = cp.id AND cp.tenant_id = $2`,
    [req.params.zoneId, req.tenantId],
  )
  res.json({ success: true })
}

export async function createPool(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false, message: 'Tenant gerekli' }); return }
  const { name, capacity, temperatureC, notes, numShelves, zonesPerShelf } = req.body as {
    name: string
    capacity: number
    temperatureC?: number
    notes?: string
    numShelves?: number
    zonesPerShelf?: number
  }

  if (!name || !capacity) {
    res.status(400).json({ success: false, message: 'Ad ve Kapasite alanları zorunludur' })
    return
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const temp = temperatureC !== undefined ? Number(temperatureC) : 20.0
    const poolRes = await client.query<{ id: string }>(
      `INSERT INTO curing_pools (tenant_id, name, capacity, temperature_c, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.tenantId, name, capacity, temp, notes || null]
    )
    const poolId = poolRes.rows[0].id

    const shelves = numShelves !== undefined ? Number(numShelves) : 1
    const perShelf = zonesPerShelf !== undefined ? Number(zonesPerShelf) : 5
    for (let shelf = 1; shelf <= shelves; shelf++) {
      for (let z = 1; z <= perShelf; z++) {
        await client.query(
          `INSERT INTO curing_pool_zones (curing_pool_id, zone_label, shelf_level, is_occupied)
           VALUES ($1, $2, $3, FALSE)`,
          [poolId, `Z-${z}`, shelf]
        )
      }
    }

    await client.query('COMMIT')
    res.status(201).json({ success: true, data: { id: poolId, name, capacity, temperature_c: temp, notes } })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ success: false, message: 'Havuz oluşturulamadı' })
  } finally {
    client.release()
  }
}

export async function updatePool(req: Request, res: Response): Promise<void> {
  if (!req.tenantId) { res.status(400).json({ success: false, message: 'Tenant gerekli' }); return }
  const { id } = req.params
  const { name, capacity, temperatureC, notes, isActive, numShelves, zonesPerShelf } = req.body as {
    name: string
    capacity: number
    temperatureC?: number
    notes?: string
    isActive?: boolean
    numShelves?: number
    zonesPerShelf?: number
  }

  if (!name || !capacity) {
    res.status(400).json({ success: false, message: 'Ad ve Kapasite zorunludur' })
    return
  }

  const temp = temperatureC !== undefined ? Number(temperatureC) : 20.0
  const active = isActive !== undefined ? Boolean(isActive) : true

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const r = await client.query(
      `UPDATE curing_pools
          SET name = $1, capacity = $2, temperature_c = $3, notes = $4, is_active = $5, updated_at = NOW()
        WHERE id = $6 AND tenant_id = $7 RETURNING *`,
      [name, capacity, temp, notes || null, active, id, req.tenantId]
    )

    if (!r.rows[0]) {
      await client.query('ROLLBACK')
      res.status(404).json({ success: false, message: 'Kür havuzu bulunamadı' })
      return
    }

    // Raf/bölge düzenleme: yalnızca eksik olanları ekle, mevcut bölgeleri ASLA silme
    // (silinen bölgede atanmış numune olabilir; önceki yapıyı koruyoruz)
    if (numShelves !== undefined || zonesPerShelf !== undefined) {
      const targetShelves = Math.max(1, Number(numShelves ?? 1))
      const targetPerShelf = Math.max(1, Number(zonesPerShelf ?? 1))

      const existing = await client.query<{ shelf_level: number; zone_label: string; id: string }>(
        `SELECT id, shelf_level, zone_label FROM curing_pool_zones
          WHERE curing_pool_id = $1
          ORDER BY shelf_level, zone_label`,
        [id]
      )
      const existingKeys = new Set(existing.rows.map((z) => `${z.shelf_level}|${z.zone_label}`))

      for (let shelf = 1; shelf <= targetShelves; shelf++) {
        for (let z = 1; z <= targetPerShelf; z++) {
          const key = `${shelf}|Z-${z}`
          if (!existingKeys.has(key)) {
            await client.query(
              `INSERT INTO curing_pool_zones (curing_pool_id, zone_label, shelf_level, is_occupied)
               VALUES ($1, $2, $3, FALSE)
               ON CONFLICT (curing_pool_id, zone_label, shelf_level) DO NOTHING`,
              [id, `Z-${z}`, shelf]
            )
          }
        }
      }
    }

    await client.query('COMMIT')
    res.json({ success: true, data: r.rows[0] })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ success: false, message: 'Havuz güncellenemedi' })
  } finally {
    client.release()
  }
}
