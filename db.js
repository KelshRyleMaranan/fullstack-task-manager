require('dotenv').config({ quiet: true });
const { Pool } = require('pg');

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