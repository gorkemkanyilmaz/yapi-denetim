// Genel migration çalıştırıcı
// Kullanım: node scripts/run-migration.mjs <sql-dosyası-yolu>
import dotenv from 'dotenv'
import pg from 'pg'
import fs from 'node:fs'
import path from 'node:path'

dotenv.config()

const sqlPath = process.argv[2]
if (!sqlPath) {
  console.error('Kullanım: node scripts/run-migration.mjs <sql-dosyası>')
  process.exit(1)
}

const abs = path.resolve(sqlPath)
if (!fs.existsSync(abs)) {
  console.error('Dosya bulunamadı:', abs)
  process.exit(1)
}

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 2,
  ssl: process.env.DB_SSLMODE === 'require' ? { rejectUnauthorized: false } : false,
})

const sql = fs.readFileSync(abs, 'utf8')

console.log('[migrate] Target:', process.env.DB_HOST, '/', process.env.DB_NAME)
console.log('[migrate] File  :', abs)
console.log('[migrate] Length :', sql.length, 'chars')

try {
  await pool.query(sql)
  console.log('[migrate] OK ✓ Migration uygulandı')
} catch (err) {
  console.error('[migrate] FAILED:', err.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
