const fs = require('fs');
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
  console.log('[migrate] connected');

  const root = path.join(__dirname, '..', '..');
  const files = [
    path.join(root, 'database', 'schema.sql'),
    path.join(root, 'database', 'seeds', 'seed.sql'),
  ];
  for (const f of files) {
    console.log('[migrate] running', f);
    const sql = fs.readFileSync(f, 'utf8');
    await client.query(sql);
    console.log('[migrate] done', f);
  }
  await client.end();
})().catch((e) => { console.error('[migrate] error', e); process.exit(1); });
