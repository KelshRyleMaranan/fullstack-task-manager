const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// Every route in this file needs a logged-in user
router.use(requireAuth);

const STATUSES = ['todo', 'in_progress', 'done'];
const PRIORITIES = ['low', 'medium', 'high'];
const TASK_COLUMNS =
  'id, title, description, status, priority, due_date, created_at, updated_at';

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Returns { error } or { value }
function parseTaskInput(body) {
  const title = String(body?.title ?? '').trim();
  const description = String(body?.description ?? '').trim();
  const status = body?.status ?? 'todo';
  const priority = body?.priority ?? 'medium';
  let dueDate = body?.due_date ?? null;
  if (dueDate === '') dueDate = null;

  if (!title || title.length > 120) {
    return { error: 'Title is required (max 120 characters).' };
  }
  if (description.length > 1000) {
    return { error: 'Description is too long (max 1000 characters).' };
  }
  if (!STATUSES.includes(status)) {
    return { error: 'Status must be todo, in_progress, or done.' };
  }
  if (!PRIORITIES.includes(priority)) {
    return { error: 'Priority must be low, medium, or high.' };
  }
  if (dueDate !== null && (typeof dueDate !== 'string' || !isValidDate(dueDate))) {
    return { error: 'Due date must look like 2026-12-31.' };
  }

  return { value: { title, description, status, priority, dueDate } };
}

// Create a task
router.post('/', async (req, res) => {
  const { error, value } = parseTaskInput(req.body);
  if (error) return res.status(400).json({ error });

  try {
    const result = await pool.query(
      `INSERT INTO tasks (user_id, title, description, status, priority, due_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${TASK_COLUMNS}`,
      [
        req.userId,
        value.title,
        value.description,
        value.status,
        value.priority,
        value.dueDate,
      ]
    );
    res.status(201).json({ task: result.rows[0] });
  } catch (err) {
    console.error('Create task failed:', err.message);
    res.status(500).json({ error: 'Could not create the task.' });
  }
});

// List my tasks (newest first)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${TASK_COLUMNS} FROM tasks
       WHERE user_id = $1
       ORDER BY created_at DESC, id DESC`,
      [req.userId]
    );
    res.json({ tasks: result.rows });
  } catch (err) {
    console.error('List tasks failed:', err.message);
    res.status(500).json({ error: 'Could not load your tasks.' });
  }
});

module.exports = router;