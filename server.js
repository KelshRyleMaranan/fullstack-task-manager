require('dotenv').config({ quiet: true });

// Refuse to start if something important is missing
const missing = ['DATABASE_URL', 'JWT_SECRET'].filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing environment variables: ${missing.join(', ')}. Check your .env file.`);
  process.exit(1);
}

const express = require('express');
const path = require('path');
const { rateLimit } = require('express-rate-limit');
const pool = require('./db');
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const requireAuth = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');

// On Render the app sits behind one proxy. Without this, every visitor
// would look like the same IP address to the rate limiter.
if (process.env.RENDER || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

/* ---------- Rate limits ---------- */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/health'),
  message: { error: 'Too many requests. Please slow down and try again in a few minutes.' },
});

// Only failed logins count, so normal use never hits this
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-ups from this network. Please try again later.' },
});

/* ---------- Middleware ---------- */
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', apiLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', registerLimiter);

/* ---------- Routes ---------- */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/health/db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS time');
    res.json({ status: 'ok', time: result.rows[0].time });
  } catch (err) {
    console.error('DB health check failed:', err.message);
    res.status(500).json({ status: 'error', message: 'Database not reachable' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);

// Protected: only works with a valid token
app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, created_at FROM users WHERE id = $1',
      [req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Account not found. Please log in again.' });
    }
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Load profile failed:', err.message);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// Unknown API URLs get a JSON answer instead of an HTML page
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// Catches errors like badly formatted or oversized JSON
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request is too large.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});