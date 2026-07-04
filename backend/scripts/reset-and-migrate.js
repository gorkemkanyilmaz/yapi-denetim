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
  console.log('[reset-and-migrate] connected to database');

  // 1. Alter table to add task acceptance columns
  console.log('[reset-and-migrate] adding task acceptance columns');
  await client.query(`
    ALTER TABLE sample_sets ADD COLUMN IF NOT EXISTS is_accepted BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE sample_sets ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
  `);
  console.log('[reset-and-migrate] task acceptance columns added');

  // 2. Truncate all workflow task related data
  console.log('[reset-and-migrate] truncating tasks and specimens');
  await client.query(`
    UPDATE curing_pool_zones SET current_sample_set_id = NULL, is_occupied = FALSE;
    UPDATE sample_sets SET curing_pool_zone_id = NULL;
    TRUNCATE TABLE specimens CASCADE;
    TRUNCATE TABLE stakeholder_signatures CASCADE;
    TRUNCATE TABLE field_collections CASCADE;
    TRUNCATE TABLE sync_queue CASCADE;
    TRUNCATE TABLE sample_sets CASCADE;
  `);
  console.log('[reset-and-migrate] database cleanup successfully completed');

  await client.end();
})().catch((e) => {
  console.error('[reset-and-migrate] migration error:', e);
  process.exit(1);
});
