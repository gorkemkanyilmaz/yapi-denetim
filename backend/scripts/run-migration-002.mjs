// Tek seferlik migration çalıştırıcı
// 002_santiye_sorumlusu_cep.sql dosyasını neon DB'ye uygular
import 'dotenv/config'
import pg from 'pg'
import fs from 'node:fs'
import path from 'node:path'

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 2,
  ssl: process.env.DB_SSLMODE === 'require' ? { rejectUnauthorized: false } : false,
})

const sqlPath = path.resolve('../database/migrations/002_santiye_sorumlusu_cep.sql')
const sql = fs.readFileSync(sqlPath, 'utf8')

console.log('[migrate] Target:', process.env.DB_HOST, '/', process.env.DB_NAME)
console.log('[migrate] File  :', sqlPath)
console.log('[migrate] Length :', sql.length, 'chars')

try {
  await pool.query(sql)
  console.log('[migrate] OK ✓ Migration uygulandı')
  const r = await pool.query(
    `SELECT column_name, data_type, character_maximum_length, is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'construction_sites'
        AND column_name = 'santiye_sorumlusu_cep'`
  )
  if (r.rows[0]) {
    console.log('[migrate] Verified column:', r.rows[0])
  } else {
    console.log('[migrate] ! Kolon bulunamadı, doğrulama başarısız')
    process.exitCode = 2
  }
} catch (err) {
  console.error('[migrate] FAILED:', err.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
