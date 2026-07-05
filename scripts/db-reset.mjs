/**
 * DATABASE SIFIRLAMA SCRİPTİ
 * Tüm iş akışı verilerini temizler: numuneler, kanban, takvim, kür havuzu, hakediş, raporlar
 * Korunur: tenants, users, construction_sites, curing_pools, curing_pool_zones (sadece doluluk sıfırlanır), equipment
 *
 * Kullanım:
 *   cd /home/ubuntu/yapi-denetim/backend
 *   node scripts/db-reset.mjs
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { Pool } from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../.env')

// .env dosyasından DB bilgilerini oku
function loadEnv(path) {
  const raw = readFileSync(path, 'utf-8')
  const env = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).trim()
  }
  return env
}

const env = loadEnv(envPath)

const pool = new Pool({
  host: env.DB_HOST,
  port: Number(env.DB_PORT || 5432),
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
})

// FK sırasına göre silinecek tablolar
const tablesToClean = [
  'test_results',
  'stakeholder_signatures',
  'field_collections',
  'reports',
  'specimens',
  'bypass_requests',
  'hakedis',
  'audit_logs',
  'sync_queue',
  'notifications',
]

async function main() {
  console.log('=== DATABASE SIFIRLAMA ===')
  console.log(`Hedef: ${env.DB_HOST}/${env.DB_NAME}`)
  console.log('')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // 1. Önce curing_pool_zones'daki dolulukları sıfırla
    const zoneReset = await client.query('UPDATE curing_pool_zones SET is_occupied = FALSE, current_sample_set_id = NULL')
    console.log(`Kür havuzu bölgeleri sıfırlandı: ${zoneReset.rowCount} zona`)

    // 2. FK sırasına göre tabloları temizle
    let totalDeleted = 0
    for (const table of tablesToClean) {
      const r = await client.query(`DELETE FROM ${table}`)
      const count = r.rowCount
      totalDeleted += count
      const status = count > 0 ? `${count} satır silindi` : 'zaten boş'
      console.log(`  ${table}: ${status}`)
    }

    // 3. sample_sets en sonda (diğer tablolar ona bağımlı)
    const ss = await client.query('DELETE FROM sample_sets')
    totalDeleted += ss.rowCount
    console.log(`  sample_sets: ${ss.rowCount > 0 ? ss.rowCount + ' satır silindi' : 'zaten boş'}`)

    await client.query('COMMIT')

    console.log('')
    console.log(`=== TAMAMLANDI ===`)
    console.log(`Toplam ${totalDeleted} satır silindi`)
    console.log('Korunan veriler: tenants, users, construction_sites, curing_pools, equipment')

  } catch (e) {
    await client.query('ROLLBACK')
    console.error('HATA:', e.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

main()
