const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Used when the email doesn't exist, so a missing user and a wrong
// password take about the same time to answer.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

router.post('/register', async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');

  if (!name || name.length > 60) {
    return res.status(400).json({ error: 'Name is required (max 60 characters).' });
  }
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  // bcrypt only uses the first 72 bytes of a password
  if (Buffer.byteLength(password) > 72) {
    return res.status(400).json({ error: 'Password is too long (max 72 characters).' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, created_at`,
      [name, email, passwordHash]
    );
    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    // 23505 = unique violation (email already used)
    if (err.code === '23505') {
      return res.status(409).json({ error: 'That email is already registered.' });
    }
    console.error('Register failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/login', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is missing in .env');
    return res.status(500).json({ error: 'Server is not configured correctly.' });
  }

  try {
    const result = await pool.query(
      'SELECT id, name, email, password_hash FROM users WHERE email = $1',
      [email]
    );
    const user = result.rows[0];

    const passwordOk = await bcrypt.compare(
      password,
      user ? user.password_hash : DUMMY_HASH
    );

    // Same message for "no such email" and "wrong password"
    if (!user || !passwordOk) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '7d',
    });

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error('Login failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;