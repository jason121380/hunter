const form = document.getElementById('form');
const button = document.getElementById('submit');
const error = document.getElementById('error');

fetch('/api/auth/me').then(r => { if (r.ok) location.replace('/'); }).catch(() => {});

form.addEventListener('submit', async e => {
  e.preventDefault();
  error.style.display = 'none';
  button.disabled = true;
  button.textContent = '登入中…';
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('username').value.trim(),
        password: document.getElementById('password').value,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || '登入失敗');
    location.replace('/');
  } catch (err) {
    error.textContent = err.message;
    error.style.display = 'block';
  } finally {
    button.disabled = false;
    button.textContent = '登入';
  }
});
