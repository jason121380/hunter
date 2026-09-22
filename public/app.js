const $ = id => document.getElementById(id);
const state = {
  client: null, campaign: null, campaigns: [], adsets: [],
  selected: new Set(), history: ['home'], mode: null,
  range: null,
};

const STATUS_LABEL = {
  ok: '可回報',
  no_data: '此區間無資料',
  requires_individual: '需個別回報',
  no_active_adsets: '無進行中廣告組合',
  error: '讀取失敗',
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { location.href = '/login'; throw new Error('請先登入。'); }
  if (!res.ok) {
    const msg = data.message || '系統錯誤';
    if (/Session has expired|access token/i.test(msg)) throw new Error('Meta 存取權杖已過期，請更新 Token。');
    throw new Error(msg);
  }
  return data;
}

function loading(v) { $('loading').hidden = !v; }
function toast(t) {
  $('toast').textContent = t;
  $('toast').hidden = false;
  setTimeout(() => { $('toast').hidden = true; }, 2200);
}

function screen(id, push = true) {
  document.querySelectorAll('.screen').forEach(x => x.classList.toggle('active', x.id === id));
  if (push && state.history.at(-1) !== id) state.history.push(id);
  $('back').hidden = id === 'home';
  $('refresh').hidden = id !== 'home';
  scrollTo(0, 0);
}
function back() {
  if (state.history.length <= 1) return;
  state.history.pop();
  screen(state.history.at(-1), false);
}

$('back').onclick = back;
$('refresh').onclick = loadClients;
$('logout').onclick = async () => {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  location.href = '/login';
};
$('adminLink').onclick = () => { location.href = '/admin'; };

async function loadClients() {
  loading(true);
  try {
    const { clients } = await api('/api/clients');
    $('clients').innerHTML = clients.map(c => `
      <button class="client" type="button" data-id="${esc(c.id)}">
        <b>${esc(c.name)}</b>
        <span class="meta">${counts(c)}</span>
      </button>`).join('') || '<p class="meta">尚無客戶資料</p>';
    document.querySelectorAll('.client').forEach(b => {
      b.onclick = () => selectClient(clients.find(c => c.id === b.dataset.id));
    });
  } catch (e) {
    $('clients').innerHTML = `<div class="error-box">${esc(e.message)}</div>`;
  } finally {
    loading(false);
  }
}

function counts(c) {
  const n = c.campaignCounts;
  return n
    ? `進行中廣告：${n.total} 組 ｜ 私訊 ${n.message} ｜ 流量 ${n.traffic}`
    : '廣告數讀取失敗，仍可進入回報';
}

function selectClient(c) {
  state.client = c;
  $('clientName').textContent = c.name;
  screen('mode');
}

$('individual').onclick = async () => {
  state.mode = 'individual';
  loading(true);
  try {
    const d = await api(`/api/accounts/${encodeURIComponent(state.client.accountId)}/campaigns`);
    state.campaigns = d.campaigns;
    renderCampaigns();
    screen('campaigns');
  } catch (e) { toast(e.message); } finally { loading(false); }
};

$('unified').onclick = () => {
  state.mode = 'unified';
  preparePeriod();
  $('periodMode').textContent = '統一回報';
  screen('period');
};

function renderCampaigns() {
  $('campaignList').innerHTML = state.campaigns.map(c => `
    <button class="card campaign" type="button" data-id="${esc(c.id)}">
      <b>${esc(c.name)}</b><span>${esc(c.typeLabel)}</span>
    </button>`).join('') || '<p class="meta">此帳號目前沒有進行中的私訊／流量廣告。</p>';
  document.querySelectorAll('.campaign').forEach(b => {
    b.onclick = () => selectCampaign(state.campaigns.find(c => c.id === b.dataset.id));
  });
}

async function selectCampaign(c) {
  state.campaign = c;
  loading(true);
  try {
    const d = await api(`/api/campaigns/${encodeURIComponent(c.id)}/adsets?accountId=${encodeURIComponent(state.client.accountId)}`);
    state.adsets = d.adSets;
    state.selected = new Set(d.adSets.map(x => x.id));
    $('campaignName').textContent = c.name;
    renderAdsets();
    screen('adsets');
  } catch (e) { toast(e.message); } finally { loading(false); }
}

function renderAdsets() {
  $('adsetList').innerHTML = state.adsets.map(a => `
    <button class="adset ${state.selected.has(a.id) ? 'selected' : ''}" type="button" data-id="${esc(a.id)}">
      <b>${esc(a.name)}</b>
      <span class="meta">${state.selected.has(a.id) ? '✓ 已選擇' : '點擊選擇'}</span>
    </button>`).join('');
  document.querySelectorAll('.adset').forEach(b => {
    b.onclick = () => {
      state.selected.has(b.dataset.id) ? state.selected.delete(b.dataset.id) : state.selected.add(b.dataset.id);
      renderAdsets();
    };
  });
}

$('adsetNext').onclick = () => {
  if (!state.selected.size) return toast('請至少選一個廣告組合');
  state.mode = 'individual';
  preparePeriod();
  $('periodMode').textContent = '個別回報';
  screen('period');
};

// ── 統計區間 ─────────────────────────────────────────────
// 不用原生 <input type="date">：iOS 的原生欄位有固定最小寬度會撐破版面，
// 選擇器也無法套用系統樣式。日期一律用本地時間的 YYYY-MM-DD 字串處理，
// 字串可直接比大小，也避免 toISOString() 轉成 UTC 造成差一天。

const pad = v => String(v).padStart(2, '0');
const toYmd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtYmd = s => s.replaceAll('-', '/');
const dayCount = (a, b) => Math.round((fromYmd(b) - fromYmd(a)) / 86400000) + 1;
function today() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

const PRESETS = {
  mtd: t => [new Date(t.getFullYear(), t.getMonth(), 1), t],
  'last-month': t => [new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 0)],
  '7d': t => [addDays(t, -6), t],
  '30d': t => [addDays(t, -29), t],
};

function presetRange(key) {
  const [a, b] = PRESETS[key](today());
  return [toYmd(a), toYmd(b)];
}

function matchPreset(start, end) {
  return Object.keys(PRESETS).find(key => {
    const [a, b] = presetRange(key);
    return a === start && b === end;
  }) || null;
}

function setRange(start, end) {
  state.range = { start, end };
  const preset = matchPreset(start, end);
  $('startLabel').textContent = fmtYmd(start);
  $('endLabel').textContent = fmtYmd(end);
  $('rangeMeta').textContent = `共 ${dayCount(start, end)} 天`;
  document.querySelectorAll('.chip[data-preset]').forEach(chip => {
    const on = chip.dataset.preset === preset;
    chip.classList.toggle('active', on);
    chip.setAttribute('aria-pressed', String(on));
  });
  clearResult();
}

function clearResult() {
  $('result').innerHTML = '';
  $('result').className = 'result';
}

// 進入區間畫面：保留這次登入中選過的區間（連續回報多個客戶時不用重選），
// 第一次進來預設「本月至今」。
function preparePeriod() {
  if (state.range) setRange(state.range.start, state.range.end);
  else setRange(...presetRange('mtd'));
}

document.querySelectorAll('.chip[data-preset]').forEach(chip => {
  chip.onclick = () => setRange(...presetRange(chip.dataset.preset));
});

const cal = { view: null, start: null, end: null };

function openPicker() {
  cal.start = state.range.start;
  cal.end = state.range.end;
  const end = fromYmd(cal.end);
  cal.view = new Date(end.getFullYear(), end.getMonth(), 1);
  renderCalendar();
  $('sheet').hidden = false;
  document.body.classList.add('no-scroll');
}

function closePicker() {
  $('sheet').hidden = true;
  document.body.classList.remove('no-scroll');
}

function renderCalendar() {
  const y = cal.view.getFullYear();
  const m = cal.view.getMonth();
  const t = today();
  const todayYmd = toYmd(t);

  $('calTitle').textContent = `${y} 年 ${m + 1} 月`;
  $('calNext').disabled = y > t.getFullYear() || (y === t.getFullYear() && m >= t.getMonth());

  const lead = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const ranged = cal.start && cal.end && cal.start !== cal.end;

  let html = '<span class="day-blank"></span>'.repeat(lead);
  for (let d = 1; d <= days; d += 1) {
    const ymd = `${y}-${pad(m + 1)}-${pad(d)}`;
    const cls = ['day'];
    if (ymd === cal.start) cls.push('is-start');
    if (ymd === cal.end) cls.push('is-end');
    if (ranged && ymd === cal.start) cls.push('has-end');
    if (ranged && ymd > cal.start && ymd < cal.end) cls.push('in-range');
    if (ymd === todayYmd) cls.push('is-today');
    const future = ymd > todayYmd;
    html += `<button type="button" class="${cls.join(' ')}" data-ymd="${ymd}"${future ? ' disabled' : ''} aria-label="${m + 1} 月 ${d} 日"><span>${d}</span></button>`;
  }
  $('calGrid').innerHTML = html;

  $('calHint').textContent = !cal.start
    ? '請選擇開始日期'
    : !cal.end
      ? `${fmtYmd(cal.start)} 起，請選擇結束日期`
      : `${fmtYmd(cal.start)} – ${fmtYmd(cal.end)}，共 ${dayCount(cal.start, cal.end)} 天`;
  $('calApply').disabled = !cal.start;
}

$('rangeField').onclick = openPicker;

$('calGrid').onclick = e => {
  const btn = e.target.closest('.day');
  if (!btn || btn.disabled) return;
  const ymd = btn.dataset.ymd;
  if (!cal.start || cal.end) { cal.start = ymd; cal.end = null; }
  else if (ymd < cal.start) { cal.start = ymd; }
  else { cal.end = ymd; }
  renderCalendar();
};

$('calPrev').onclick = () => {
  cal.view = new Date(cal.view.getFullYear(), cal.view.getMonth() - 1, 1);
  renderCalendar();
};
$('calNext').onclick = () => {
  cal.view = new Date(cal.view.getFullYear(), cal.view.getMonth() + 1, 1);
  renderCalendar();
};

$('calApply').onclick = () => {
  if (!cal.start) return;
  setRange(cal.start, cal.end || cal.start);
  closePicker();
};

$('sheet').addEventListener('click', e => {
  if (e.target.closest('[data-close]')) closePicker();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('sheet').hidden) closePicker();
});

$('run').onclick = async () => {
  if (!state.range) return toast('請選擇日期');
  const { start: startDate, end: endDate } = state.range;
  loading(true);
  try {
    const payload = state.mode === 'unified'
      ? { accountId: state.client.accountId, startDate, endDate }
      : { accountId: state.client.accountId, campaignId: state.campaign.id, adSetIds: [...state.selected], startDate, endDate };
    const d = await api(
      state.mode === 'unified' ? '/api/reports/unified' : '/api/reports/individual',
      { method: 'POST', body: JSON.stringify(payload) }
    );
    renderResult(d);
  } catch (e) { toast(e.message); } finally { loading(false); }
};

function renderResult(d) {
  const box = $('result');
  if (state.mode === 'unified') {
    box.className = 'result result-list';
    box.innerHTML = (d.items || []).map(x => `
      <div class="report">
        <div class="report-head">
          <strong>${esc(x.campaign.name)}</strong>
          <span class="status status-${esc(x.status)}">${esc(STATUS_LABEL[x.status] || x.status)}</span>
        </div>
        ${x.report
          ? `<div class="metric-grid">${metrics(x.report)}</div>`
          : `<p class="report-msg">${esc(x.message || '')}</p>`}
      </div>`).join('') || '<p class="meta">此帳號目前沒有進行中的廣告。</p>';
  } else {
    box.className = 'result metric-grid';
    box.innerHTML = metrics(d.reports?.[0]);
  }
}

function metrics(r) {
  if (!r) return '';
  const d = r.data || {};
  const tile = (label, value) => `<div class="metric"><span>${esc(label)}</span><b>${value}</b></div>`;
  if (r.type === 'message') {
    return tile('累積私訊數', n(d.messages))
      + tile('單次私訊成本', 'NT$ ' + n(d.costPerMessage))
      + tile('累積花費', 'NT$ ' + n(d.actualSpend));
  }
  const label = d.resultLabel || '成果';
  return tile(`${label}次數`, n(d.resultCount))
    + tile(`每次${label}成本`, 'NT$ ' + n(d.costPerResult))
    + tile('花費', 'NT$ ' + n(d.actualSpend))
    + tile('點擊率', Number(d.ctr || 0).toFixed(2) + '%');
}

function n(v) { return Math.round(Number(v) || 0).toLocaleString('zh-TW'); }
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function showAdminEntry() {
  try {
    const { user } = await api('/api/auth/me');
    if (user?.role === 'ADMIN') $('adminLink').hidden = false;
  } catch {}
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

showAdminEntry();
loadClients();
