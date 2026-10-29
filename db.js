require('dotenv').config({ quiet: true });
const { Pool, types } = require('pg');

// Keep DATE columns as plain 'YYYY-MM-DD' text (avoids time zone shifts)
types.setTypeParser(1082, (value) => value);

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is missing. Add it to your .env file.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 10000,
});

// Neon closes idle connections when it sleeps. Without this handler,
// that would crash the server.
pool.on('error', (err) => {
  console.error('Unexpected database error:', err.message);
});

module.exports = pool;