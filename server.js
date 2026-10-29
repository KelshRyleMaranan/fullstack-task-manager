require('dotenv').config({ quiet: true });
const express = require('express');
const path = require('path');
const pool = require('./db');
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const requireAuth = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

// Catches errors like badly formatted JSON
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});