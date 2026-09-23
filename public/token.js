// PWA 左緣右滑（見 gestures.js）
document.addEventListener('edge-back', () => { location.href = '/'; });

const result = document.getElementById('result');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

document.getElementById('go').onclick = async () => {
  result.className = 'result-box show';
  result.textContent = '處理中…';
  try {
    const res = await fetch('/api/admin/exchange-meta-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shortToken: document.getElementById('short').value.trim() }),
    });
    if (res.status === 401) { location.href = '/login'; return; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || '交換失敗');

    result.innerHTML =
      '<div class="ok"><b>交換成功</b></div>' +
      '<p>有效期：約 ' + esc(data.expiresInDays ?? '?') + ' 天</p>' +
      '<div class="token" id="longToken"></div>' +
      '<button id="copy" class="primary" type="button">複製 Long-Lived Token</button>';

    document.getElementById('longToken').textContent = data.accessToken;
    document.getElementById('copy').onclick = async () => {
      await navigator.clipboard.writeText(data.accessToken);
      document.getElementById('copy').textContent = '已複製';
    };
  } catch (e) {
    result.innerHTML = '<div class="err"><b>' + esc(e.message) + '</b></div>';
  }
};
