require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  // Setup scripts prefer the direct (unpooled) connection when available.
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.error('Missing DATABASE_URL in your .env file.');
    process.exit(1);
  }

  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const client = new Client({ connectionString: url });

  try {
    await client.connect();
    await client.query(sql);
    const result = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN ('users', 'tasks')
       ORDER BY table_name`
    );
    console.log('Tables ready:', result.rows.map((r) => r.table_name).join(', '));
  } catch (err) {
    console.error('Setup failed:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main();