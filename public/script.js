const dot = document.getElementById('status-dot');
const text = document.getElementById('status-text');

async function checkServer() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    dot.classList.add('ok');
    text.textContent = `Server status: ${data.status}`;
  } catch (err) {
    text.textContent = 'Server is not reachable';
  }
}

checkServer();