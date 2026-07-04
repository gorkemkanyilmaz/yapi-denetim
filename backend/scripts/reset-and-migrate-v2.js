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
  console.log('[reset-and-migrate-v2] connected to database');

  // 1. Create bypass_requests table
  console.log('[reset-and-migrate-v2] creating bypass_requests table');
  await client.query(`
    CREATE TABLE IF NOT EXISTS bypass_requests (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      sample_set_id UUID NOT NULL REFERENCES sample_sets(id) ON DELETE CASCADE,
      requested_by UUID NOT NULL REFERENCES users(id),
      distance_m INTEGER NOT NULL,
      threshold_m INTEGER NOT NULL,
      token VARCHAR(20) NOT NULL UNIQUE,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log('[reset-and-migrate-v2] bypass_requests table created or verified');

  // 2. Truncate all workflow task related data
  console.log('[reset-and-migrate-v2] truncating workflow data');
  await client.query(`
    UPDATE curing_pool_zones SET current_sample_set_id = NULL, is_occupied = FALSE;
    UPDATE sample_sets SET curing_pool_zone_id = NULL;
    TRUNCATE TABLE specimens CASCADE;
    TRUNCATE TABLE stakeholder_signatures CASCADE;
    TRUNCATE TABLE field_collections CASCADE;
    TRUNCATE TABLE sync_queue CASCADE;
    TRUNCATE TABLE bypass_requests CASCADE;
    TRUNCATE TABLE sample_sets CASCADE;
  `);
  console.log('[reset-and-migrate-v2] database reset successfully completed');

  await client.end();
})().catch((e) => {
  console.error('[reset-and-migrate-v2] migration error:', e);
  process.exit(1);
});
