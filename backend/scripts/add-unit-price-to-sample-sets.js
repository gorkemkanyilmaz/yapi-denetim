const path = require('path');
const { Client } = require(path.join(process.cwd(), 'node_modules', 'pg'));

(async () => {
  require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log('[add-unit-price] connected to database');

  console.log('[add-unit-price] adding unit_price_try column to sample_sets');
  await client.query(`
    ALTER TABLE sample_sets 
    ADD COLUMN IF NOT EXISTS unit_price_try DECIMAL(12, 2) NOT NULL DEFAULT 0.00;
  `);
  console.log('[add-unit-price] column added successfully');

  await client.end();
})().catch((e) => {
  console.error('[add-unit-price] migration error:', e);
  process.exit(1);
});
