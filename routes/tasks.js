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
const MAX_ID = 2147483647; // largest value of an INTEGER column

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

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id >= 1 && id <= MAX_ID ? id : null;
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

// Update a task (send only the fields you want to change)
router.patch('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid task id.' });

  const body = req.body ?? {};

  try {
    const existing = await pool.query(
      `SELECT ${TASK_COLUMNS} FROM tasks WHERE id = $1 AND user_id = $2`,
      [id, req.userId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found.' });
    }
    const current = existing.rows[0];

    // Start from the saved task, then apply whatever was sent
    const { error, value } = parseTaskInput({
      title: body.title ?? current.title,
      description: body.description ?? current.description,
      status: body.status ?? current.status,
      priority: body.priority ?? current.priority,
      due_date: 'due_date' in body ? body.due_date : current.due_date,
    });
    if (error) return res.status(400).json({ error });

    const result = await pool.query(
      `UPDATE tasks
       SET title = $1, description = $2, status = $3, priority = $4,
           due_date = $5, updated_at = NOW()
       WHERE id = $6 AND user_id = $7
       RETURNING ${TASK_COLUMNS}`,
      [
        value.title,
        value.description,
        value.status,
        value.priority,
        value.dueDate,
        id,
        req.userId,
      ]
    );
    res.json({ task: result.rows[0] });
  } catch (err) {
    console.error('Update task failed:', err.message);
    res.status(500).json({ error: 'Could not update the task.' });
  }
});

// Delete a task
router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid task id.' });

  try {
    const result = await pool.query(
      'DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found.' });
    }
    res.json({ message: 'Task deleted.' });
  } catch (err) {
    console.error('Delete task failed:', err.message);
    res.status(500).json({ error: 'Could not delete the task.' });
  }
});

module.exports = router;