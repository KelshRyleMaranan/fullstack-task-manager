const authView = document.getElementById('auth-view');
const appView = document.getElementById('app-view');
const form = document.getElementById('auth-form');
const subtitle = document.getElementById('auth-subtitle');
const submitBtn = document.getElementById('submit-btn');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const passwordInput = document.getElementById('password');
const formError = document.getElementById('form-error');

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

// Temporary: pick a screen from the URL (#login, #register, #app)
function showView() {
  const hash = window.location.hash;
  const showApp = hash === '#app';
  appView.classList.toggle('hidden', !showApp);
  authView.classList.toggle('hidden', showApp);
  if (!showApp) {
    setMode(hash === '#register' ? 'register' : 'login');
  }
}

// No server calls yet. Commit 12 adds them.
form.addEventListener('submit', (event) => {
  event.preventDefault();
});

window.addEventListener('hashchange', showView);
showView();