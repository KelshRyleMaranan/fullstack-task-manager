const TOKEN_KEY = 'taskManagerToken';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

let currentUser = null;

// Hide the login card until we know whether you're already logged in
authView.classList.add('hidden');

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

/* ---------- API helper (commit 13 reuses this) ---------- */
async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error('Cannot reach the server. Check your connection.');
  }

  let data = {};
  try {
    data = await res.json();
  } catch (err) {
    /* response had no JSON body */
  }

  if (!res.ok) {
    const error = new Error(data.error || 'Something went wrong.');
    error.status = res.status;
    throw error;
  }
  return data;
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
    const data = await api('/api/me');
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
  }

  if (currentUser) {
    if (hash !== '#app') {
      window.location.hash = '#app';
      return;
    }
    showUser(currentUser);
    authView.classList.add('hidden');
    appView.classList.remove('hidden');
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

/* ---------- Form ---------- */
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

  setLoading(true);
  try {
    if (isRegister) {
      await api('/api/auth/register', { method: 'POST', body: { name, email, password } });
    }
    const data = await api('/api/auth/login', { method: 'POST', body: { email, password } });
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
  clearToken();
  currentUser = null;
  form.reset();
  // The link itself changes the address to #login
});

window.addEventListener('hashchange', route);
route();