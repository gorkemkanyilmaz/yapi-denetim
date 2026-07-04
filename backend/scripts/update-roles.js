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
  console.log('[update-roles] connected to database');

  // Update roles of all users except Ahmet Yilmaz (owner@ankaraydl.com) to field_tech
  const res = await client.query(`
    UPDATE users 
    SET role = 'field_tech' 
    WHERE email != 'owner@ankaraydl.com' 
    RETURNING id, full_name, email, role;
  `);

  console.log('[update-roles] Updated users:');
  console.log(res.rows);

  await client.end();
})().catch((e) => {
  console.error('[update-roles] error:', e);
  process.exit(1);
});
