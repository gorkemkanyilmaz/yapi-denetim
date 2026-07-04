import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config()

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSLMODE === 'require' ? { rejectUnauthorized: false } : false,
})

const newDate = process.argv[2] // '2020-01-01' veya '2026-12-31'
const r = await pool.query(
  "UPDATE tenants SET expires_at = $1 WHERE slug = 'ankara-ydl' RETURNING slug, expires_at",
  [newDate]
)
console.log('Güncellendi:', JSON.stringify(r.rows))
await pool.end()
