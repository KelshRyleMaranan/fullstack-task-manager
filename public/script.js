const TOKEN_KEY = 'taskManagerToken';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLOW_MESSAGE = 'Waking up the server. This can take up to a minute on free hosting...';

const GROUPS = [
  { key: 'todo', label: 'To-do' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
];
const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High' };

const authView = document.getElementById('auth-view');
const appView = document.getElementById('app-view');
const form = document.getElementById('auth-form');
const subtitle = document.getElementById('auth-subtitle');
const submitBtn = document.getElementById('submit-btn');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const formError = document.getElementById('form-error');
const logoutBtn = document.getElementById('logout-btn');
const userName = document.getElementById('user-name');
const userEmail = document.getElementById('user-email');
const userInitial = document.getElementById('user-initial');

const groupsEl = document.getElementById('groups');
const banner = document.getElementById('task-banner');
const bannerText = document.getElementById('task-banner-text');
const retryBtn = document.getElementById('retry-btn');
const newTaskBtn = document.getElementById('new-task-btn');
const navButtons = document.querySelectorAll('.nav-link');

const dialog = document.getElementById('task-dialog');
const dialogTitle = document.getElementById('dialog-title');
const taskForm = document.getElementById('task-form');
const taskTitleInput = document.getElementById('task-title');
const taskDescInput = document.getElementById('task-description');
const taskStatusInput = document.getElementById('task-status');
const taskPriorityInput = document.getElementById('task-priority');
const taskDueInput = document.getElementById('task-due');
const taskError = document.getElementById('task-error');
const taskSave = document.getElementById('task-save');
const taskCancel = document.getElementById('task-cancel');

let currentUser = null;
let tasks = [];
let filter = 'all';
let tasksLoaded = false;
let editingId = null;
let startupNotice = null;
const busyIds = new Set();

// Hide the login card until we know whether you're already logged in
authView.classList.add('hidden');

/* ---------- Small helpers ---------- */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Shown on a blank page while a sleeping server wakes up
function showStartupNotice() {
  if (startupNotice) return;
  startupNotice = el('p', 'muted', SLOW_MESSAGE);
  startupNotice.style.cssText = 'padding: 2rem; text-align: center;';
  document.body.prepend(startupNotice);
}

function hideStartupNotice() {
  if (!startupNotice) return;
  startupNotice.remove();
  startupNotice = null;
}

/* ---------- Token storage ---------- */
function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (err) {
    return null;
  }
}

function setToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch (err) {
    /* storage unavailable: you'll just need to log in again next visit */
  }
}

function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (err) {
    /* nothing to clear */
  }
}

/* ---------- API helper ---------- */
// onSlow runs if the server hasn't answered after 4 seconds
async function api(path, { method = 'GET', body, onSlow } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const slowTimer = onSlow ? setTimeout(onSlow, 4000) : null;
  let res;
  let data = {};

  try {
    res = await fetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    try {
      data = await res.json();
    } catch (err) {
      /* response had no JSON body */
    }
  } catch (err) {
    throw new Error('Cannot reach the server. Check your connection.');
  } finally {
    clearTimeout(slowTimer);
  }

  if (!res.ok) {
    const error = new Error(data.error || 'Something went wrong. Please try again.');
    error.status = res.status;
    throw error;
  }
  return data;
}

/* ---------- Session ---------- */
function resetSession() {
  clearToken();
  currentUser = null;
  tasks = [];
  tasksLoaded = false;
  filter = 'all';
  navButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.filter === 'all'));
  groupsEl.replaceChildren();
  hideBanner();
}

// Returns true if the error meant "you're logged out" and we handled it
function handleAuthError(err) {
  if (err.status !== 401) return false;
  resetSession();
  window.location.hash = '#login';
  route();
  return true;
}

/* ---------- Screens ---------- */
function setMode(mode) {
  const isRegister = mode === 'register';
  form.dataset.mode = mode;
  tabLogin.classList.toggle('active', !isRegister);
  tabRegister.classList.toggle('active', isRegister);
  submitBtn.textContent = isRegister ? 'Create account' : 'Log in';
  subtitle.textContent = isRegister
    ? 'Create an account to start tracking tasks.'
    : 'Log in to see your tasks.';
  passwordInput.autocomplete = isRegister ? 'new-password' : 'current-password';
  formError.textContent = '';
}

function showUser(user) {
  userName.textContent = user.name;
  userEmail.textContent = user.email;
  userInitial.textContent = user.name.trim().charAt(0).toUpperCase() || '?';
}

async function loadUser() {
  if (!getToken()) return null;
  try {
    const data = await api('/api/me', { onSlow: showStartupNotice });
    return data.user;
  } catch (err) {
    // Expired or invalid token: forget it
    if (err.status === 401) clearToken();
    return null;
  }
}

async function route() {
  const hash = window.location.hash;

  if (!currentUser && getToken()) {
    currentUser = await loadUser();
    hideStartupNotice();
  }

  if (currentUser) {
    if (hash !== '#app') {
      window.location.hash = '#app';
      return;
    }
    showUser(currentUser);
    authView.classList.add('hidden');
    appView.classList.remove('hidden');
    if (!tasksLoaded) loadTasks();
    return;
  }

  if (hash !== '#login' && hash !== '#register') {
    window.location.hash = '#login';
    return;
  }
  appView.classList.add('hidden');
  authView.classList.remove('hidden');
  setMode(hash === '#register' ? 'register' : 'login');
}

/* ---------- Login / register form ---------- */
function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  if (isLoading) {
    submitBtn.textContent = 'Please wait...';
  } else {
    submitBtn.textContent = form.dataset.mode === 'register' ? 'Create account' : 'Log in';
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  formError.textContent = '';

  const isRegister = form.dataset.mode === 'register';
  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (isRegister && !name) {
    formError.textContent = 'Please enter your name.';
    return;
  }
  if (!EMAIL_REGEX.test(email)) {
    formError.textContent = 'Please enter a valid email.';
    return;
  }
  if (!password) {
    formError.textContent = 'Please enter your password.';
    return;
  }
  if (isRegister && password.length < 8) {
    formError.textContent = 'Password must be at least 8 characters.';
    return;
  }

  const onSlow = () => {
    submitBtn.textContent = 'Waking up the server...';
  };

  setLoading(true);
  try {
    if (isRegister) {
      await api('/api/auth/register', {
        method: 'POST',
        body: { name, email, password },
        onSlow,
      });
    }
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: { email, password },
      onSlow,
    });
    setToken(data.token);
    currentUser = data.user;
    form.reset();
    window.location.hash = '#app';
  } catch (err) {
    formError.textContent = err.message;
  } finally {
    setLoading(false);
  }
});

logoutBtn.addEventListener('click', () => {
  resetSession();
  form.reset();
  // The link itself changes the address to #login
});

/* ---------- Banner ---------- */
function showBanner(message, canRetry) {
  bannerText.textContent = message;
  retryBtn.classList.toggle('hidden', !canRetry);
  banner.classList.remove('hidden');
}

function hideBanner() {
  banner.classList.add('hidden');
}

retryBtn.addEventListener('click', loadTasks);

/* ---------- Dates ---------- */
function todayString() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

// 'YYYY-MM-DD' -> 'Nov 5' (built from parts, so no time zone shifts)
function formatDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  const options = { month: 'short', day: 'numeric' };
  if (year !== new Date().getFullYear()) options.year = 'numeric';
  return new Date(year, month - 1, day).toLocaleDateString(undefined, options);
}

/* ---------- Rendering ---------- */
function updateCounts() {
  const counts = { all: tasks.length, todo: 0, in_progress: 0, done: 0 };
  tasks.forEach((task) => {
    counts[task.status] += 1;
  });
  document.querySelectorAll('[data-count]').forEach((node) => {
    node.textContent = String(counts[node.dataset.count]);
  });
}

function buildRow(task) {
  const isDone = task.status === 'done';
  const row = el('div', isDone ? 'task-row is-done' : 'task-row');

  const check = el('button', isDone ? 'check checked' : 'check');
  check.type = 'button';
  check.setAttribute('aria-label', isDone ? 'Mark as not done' : 'Mark as done');
  check.addEventListener('click', () => toggleDone(task));

  const main = el('div', 'task-main');
  main.append(el('div', 'task-title', task.title));
  if (task.description) main.append(el('div', 'task-desc', task.description));

  const overdue = !isDone && task.due_date && task.due_date < todayString();
  let metaText = 'No due date';
  if (task.due_date) {
    metaText = overdue
      ? `Overdue \u00b7 ${formatDate(task.due_date)}`
      : `Due ${formatDate(task.due_date)}`;
  }
  main.append(el('div', overdue ? 'task-meta overdue' : 'task-meta', metaText));

  const pill = el('span', `pill pill-${task.priority}`, PRIORITY_LABELS[task.priority]);

  const actions = el('div', 'task-actions');
  const editBtn = el('button', 'link-btn', 'Edit');
  editBtn.type = 'button';
  editBtn.addEventListener('click', () => openDialog(task));
  const deleteBtn = el('button', 'link-btn danger', 'Delete');
  deleteBtn.type = 'button';
  deleteBtn.addEventListener('click', () => deleteTask(task));
  actions.append(editBtn, deleteBtn);

  row.append(check, main, pill, actions);
  return row;
}

function render() {
  updateCounts();
  const fragment = document.createDocumentFragment();

  GROUPS.forEach((group) => {
    if (filter !== 'all' && filter !== group.key) return;

    const items = tasks.filter((task) => task.status === group.key);
    const section = el('section', 'group');
    const head = el('header', 'group-head');
    head.append(el('h3', '', group.label), el('span', 'count', String(items.length)));
    section.append(head);

    if (items.length === 0) {
      section.append(el('p', 'empty', 'Nothing here yet.'));
    } else {
      items.forEach((task) => section.append(buildRow(task)));
    }
    fragment.append(section);
  });

  groupsEl.replaceChildren(fragment);
}

/* ---------- Tasks: load, toggle, delete ---------- */
async function loadTasks() {
  tasksLoaded = true;
  hideBanner();
  const loadingEl = el('p', 'muted loading', 'Loading your tasks...');
  groupsEl.replaceChildren(loadingEl);
  try {
    const data = await api('/api/tasks', {
      onSlow: () => {
        loadingEl.textContent = SLOW_MESSAGE;
      },
    });
    tasks = data.tasks;
    render();
  } catch (err) {
    if (handleAuthError(err)) return;
    tasksLoaded = false;
    groupsEl.replaceChildren();
    showBanner(err.message, true);
  }
}

function replaceTask(updated) {
  tasks = tasks.map((task) => (task.id === updated.id ? updated : task));
}

async function toggleDone(task) {
  if (busyIds.has(task.id)) return;
  busyIds.add(task.id);
  hideBanner();
  try {
    const status = task.status === 'done' ? 'todo' : 'done';
    const data = await api(`/api/tasks/${task.id}`, { method: 'PATCH', body: { status } });
    replaceTask(data.task);
    render();
  } catch (err) {
    if (!handleAuthError(err)) showBanner(err.message, false);
  } finally {
    busyIds.delete(task.id);
  }
}

async function deleteTask(task) {
  if (busyIds.has(task.id)) return;
  if (!window.confirm(`Delete "${task.title}"?`)) return;
  busyIds.add(task.id);
  hideBanner();
  try {
    await api(`/api/tasks/${task.id}`, { method: 'DELETE' });
    tasks = tasks.filter((item) => item.id !== task.id);
    render();
  } catch (err) {
    if (!handleAuthError(err)) showBanner(err.message, false);
  } finally {
    busyIds.delete(task.id);
  }
}

/* ---------- Filters ---------- */
navButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    filter = btn.dataset.filter;
    navButtons.forEach((other) => other.classList.toggle('active', other === btn));
    render();
  });
});

/* ---------- New / edit popup ---------- */
function openDialog(task) {
  editingId = task ? task.id : null;
  dialogTitle.textContent = task ? 'Edit task' : 'New task';
  taskSave.textContent = task ? 'Save changes' : 'Add task';
  taskTitleInput.value = task ? task.title : '';
  taskDescInput.value = task ? task.description : '';
  taskStatusInput.value = task ? task.status : filter !== 'all' ? filter : 'todo';
  taskPriorityInput.value = task ? task.priority : 'medium';
  taskDueInput.value = task && task.due_date ? task.due_date : '';
  taskError.textContent = '';
  dialog.showModal();
}

newTaskBtn.addEventListener('click', () => openDialog(null));
taskCancel.addEventListener('click', () => dialog.close());

taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  taskError.textContent = '';

  const title = taskTitleInput.value.trim();
  if (!title) {
    taskError.textContent = 'Please enter a title.';
    return;
  }

  const body = {
    title,
    description: taskDescInput.value.trim(),
    status: taskStatusInput.value,
    priority: taskPriorityInput.value,
    due_date: taskDueInput.value || null,
  };

  taskSave.disabled = true;
  try {
    if (editingId) {
      const data = await api(`/api/tasks/${editingId}`, { method: 'PATCH', body });
      replaceTask(data.task);
    } else {
      const data = await api('/api/tasks', { method: 'POST', body });
      tasks = [data.task, ...tasks];
    }
    dialog.close();
    render();
  } catch (err) {
    if (handleAuthError(err)) {
      dialog.close();
      return;
    }
    taskError.textContent = err.message;
  } finally {
    taskSave.disabled = false;
  }
});

window.addEventListener('hashchange', route);
route();