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
$('refresh').onclick = () => loadClients({ refresh: true });
$('logout').onclick = async () => {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  location.href = '/login';
};
$('adminLink').onclick = () => { location.href = '/admin'; };

// 首頁分兩段載入：客戶清單只查資料庫（很快），先畫出來；
// 「進行中廣告數」要逐一問 Meta（慢），抓到再填進去。
let clientsLoadId = 0;

async function loadClients({ refresh = false } = {}) {
  const loadId = ++clientsLoadId;
  if (!$('clients').children.length) $('clients').innerHTML = skeletonCards(4);

  let clients;
  try {
    ({ clients } = await api('/api/clients'));
  } catch (e) {
    if (loadId === clientsLoadId) $('clients').innerHTML = `<div class="error-box">${esc(e.message)}</div>`;
    return;
  }
  if (loadId !== clientsLoadId) return;

  $('clients').innerHTML = clients.map(c => `
    <button class="client" type="button" data-id="${esc(c.id)}">
      <b>${esc(c.name)}</b>
      <span class="meta" data-counts><span class="skeleton" aria-label="讀取中"></span></span>
    </button>`).join('') || '<p class="meta">尚無客戶資料</p>';
  document.querySelectorAll('.client').forEach(b => {
    b.onclick = () => selectClient(clients.find(c => c.id === b.dataset.id));
  });
  if (!clients.length) return;

  $('refresh').classList.add('spinning');
  try {
    const { counts, updatedAt } = await api(`/api/clients/campaign-counts${refresh ? '?refresh=1' : ''}`);
    if (loadId !== clientsLoadId) return;
    document.querySelectorAll('.client').forEach(b => {
      b.querySelector('[data-counts]').textContent = countsText(counts[b.dataset.id]);
    });
    $('countsInfo').textContent = updatedAt ? `廣告數更新於 ${hhmm(updatedAt)}，按右上 ↻ 取得最新` : '';
  } catch {
    if (loadId !== clientsLoadId) return;
    document.querySelectorAll('[data-counts]').forEach(el => { el.textContent = countsText(null); });
  } finally {
    if (loadId === clientsLoadId) $('refresh').classList.remove('spinning');
  }
}

function skeletonCards(n) {
  return Array.from({ length: n }, () => `
    <div class="client client--skeleton" aria-hidden="true">
      <span class="skeleton skeleton--title"></span>
      <span class="skeleton"></span>
    </div>`).join('');
}

function countsText(n) {
  return n
    ? `進行中廣告：${n.total} 組 ｜ 私訊 ${n.message} ｜ 流量 ${n.traffic}`
    : '廣告數讀取失敗，仍可進入回報';
}

function hhmm(iso) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  $('run').textContent = '讀取成效';
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
  $('run').textContent = '讀取成效預覽';
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

$('run').onclick = () => runReport();

async function runReport() {
  if (!state.range) return toast('請選擇日期');
  const { start: startDate, end: endDate } = state.range;
  loading(true);
  try {
    const payload = state.mode === 'unified'
      ? { accountId: state.client.accountId, startDate, endDate }
      : { accountId: state.client.accountId, campaignId: state.campaign.id, adSetIds: [...state.selected], startDate, endDate };
    const statusQuery = new URLSearchParams({ clientId: state.client.id, startDate, endDate });
    // 成效與「已回報」狀態同時抓，卡片一次畫對，不會先顯示未回報再跳成已回報
    const [d, reported] = await Promise.all([
      api(state.mode === 'unified' ? '/api/reports/unified' : '/api/reports/individual',
        { method: 'POST', body: JSON.stringify(payload) }),
      api(`/api/reports/status?${statusQuery}`).catch(() => ({ items: [] })),
    ]);
    const reportedIds = new Set((reported.items || []).map(x => String(x.campaignId)));
    const ctx = { startDate, endDate, reportedIds };
    if (state.mode === 'unified') renderUnified(d, ctx);
    else renderPreview(d, ctx);
  } catch (e) { toast(e.message); } finally { loading(false); }
}

// ── 成效卡片 ─────────────────────────────────────────────
// 與舊版 Apps Script 相同：
//   統一回報 → 每個廣告一張回報卡片（文字 + 複製）
//   個別回報 → 先顯示「成效預覽」，再選「純文字回報」或「圖片回報」

const TYPE_BADGE = { message: '私訊型廣告', traffic: '流量型廣告' };
let resultCards = [];

function makeCard(x, { startDate, endDate, reportedIds }) {
  return {
    ...x,
    text: x.status === 'ok' && x.report ? reportText(x.campaign.name, x.report, startDate, endDate) : '',
    reported: reportedIds.has(String(x.campaign.id)),
    period: { startDate, endDate },
  };
}

function renderUnified(d, ctx) {
  const box = $('result');
  box.className = 'result result-list';
  resultCards = (d.items || []).map(x => makeCard(x, ctx));
  box.innerHTML = resultCards.map((c, i) => reportCard(c, i)).join('')
    || '<p class="meta">此帳號目前沒有進行中的廣告。</p>';
  wireCopyButtons(box);
}

function wireCopyButtons(root) {
  root.querySelectorAll('[data-copy]').forEach(btn => {
    btn.onclick = () => copyReport(Number(btn.dataset.copy), btn);
  });
}

function statusPill(c) {
  if (c.status === 'ok' && c.text) {
    return c.reported
      ? '<span class="status status-done">✓ 已回報</span>'
      : '<span class="status status-pending">尚未回報</span>';
  }
  return `<span class="status status-${esc(c.status)}">${esc(STATUS_LABEL[c.status] || c.status)}</span>`;
}

function reportCard(c, i) {
  const ok = c.status === 'ok' && c.text;
  const type = c.report?.type || c.campaign.type;
  return `
    <article class="report${ok && c.reported ? ' is-reported' : ''}" data-card="${i}">
      <div class="report-head">
        <div class="report-title">
          <strong>${esc(c.campaign.name)}</strong>
          ${TYPE_BADGE[type] ? `<span class="type-badge type-${esc(type)}">${TYPE_BADGE[type]}</span>` : ''}
        </div>
        ${statusPill(c)}
      </div>
      ${ok
        ? `<pre class="report-text">${esc(c.text)}</pre>
           <button class="copy-btn${c.reported ? ' is-done' : ''}" type="button" data-copy="${i}">${c.reported ? '再次複製' : '複製回報'}</button>`
        : `<p class="report-msg">${esc(c.message || '')}</p>`}
    </article>`;
}

// 標題與日期行，文字回報、預覽、圖片共用同一套規則
function periodLabels(startDate, endDate) {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const sameMonth = sy === ey && sm === em;
  const mmdd = (m, dd) => `${pad(m)}/${pad(dd)}`;
  return {
    heading: sameMonth ? `${em}月份廣告成效回報` : '廣告成效回報',
    dateLine: sameMonth && sd === 1 ? `日期：截至 ${mmdd(em, ed)}` : `日期：${mmdd(sm, sd)} – ${mmdd(em, ed)}`,
  };
}

// 回報文字格式與舊版相同：
//   廣告名稱 / M月份廣告成效回報 / 日期：截至 MM/DD / 各項指標
function reportText(name, report, startDate, endDate) {
  const { heading, dateLine } = periodLabels(startDate, endDate);
  const lines = metricRows(report).map(([label, value]) => `${label}：${value.replace('NT$ ', '$ ')}`);
  return [name, heading, '', dateLine, '', ...lines].join('\n');
}

// 指標定義只有一份：預覽格子、文字回報、圖片回報都從這裡取
function metricRows(report) {
  const d = report?.data || {};
  if (report?.type === 'message') {
    return [
      ['累積私訊數', n(d.messages)],
      ['單次私訊成本', `NT$ ${n(d.costPerMessage)}`],
      ['累積花費', `NT$ ${n(d.actualSpend)}`],
    ];
  }
  const label = d.resultLabel || '成果';
  return [
    [`${label}次數`, n(d.resultCount)],
    [`每次${label}成本`, `NT$ ${n(d.costPerResult)}`],
    ['累積花費', `NT$ ${n(d.actualSpend)}`],
    ['點擊率', `${Number(d.ctr || 0).toFixed(2)}%`],
  ];
}

async function markReported(card, metadata) {
  await api('/api/reports/mark-reported', {
    method: 'POST',
    body: JSON.stringify({
      clientId: state.client.id,
      campaignId: card.campaign.id,
      campaignName: card.campaign.name,
      reportType: state.mode === 'unified' ? 'unified' : 'individual',
      startDate: card.period.startDate,
      endDate: card.period.endDate,
      metadata,
    }),
  });
  card.reported = true;
}

async function copyReport(index, btn) {
  const card = resultCards[index];
  if (!card || btn.disabled) return;
  btn.disabled = true;

  // 必須在點擊當下就呼叫剪貼簿，iOS Safari 在 await 之後會失去使用者手勢而拒絕寫入
  const copied = await copyText(card.text);
  if (!copied) {
    btn.disabled = false;
    return toast('複製失敗，請長按上方文字手動複製');
  }

  if (card.reported) {
    btn.disabled = false;
    return toast('已再次複製回報內容');
  }

  try {
    await markReported(card, { format: 'text', text: card.text });
    const el = document.querySelector(`[data-card="${index}"]`);
    el.outerHTML = reportCard(card, index);
    wireCopyButtons(document.querySelector(`[data-card="${index}"]`));
    toast('回報已複製，已標記為已回報。');
  } catch (e) {
    btn.disabled = false;
    toast(`已複製，但標記已回報失敗：${e.message}`);
  }
}

function copyText(text) {
  const legacy = () => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.className = 'clipboard-proxy';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    ta.remove();
    return ok;
  };
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(() => true, () => legacy());
  }
  return Promise.resolve(legacy());
}

// ── 個別回報：成效預覽 → 純文字／圖片 ─────────────────────────

let preview = null;

const RELOAD_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>';

function renderPreview(d, ctx) {
  const report = d.reports?.[0];
  const status = report && report.hasData !== false ? 'ok' : 'no_data';
  const card = makeCard({ status, campaign: d.campaign, report, message: '此日期區間沒有可用的成效資料。' }, ctx);
  resultCards = [card];
  preview = { card, image: null };

  const { dateLine } = periodLabels(ctx.startDate, ctx.endDate);
  const box = $('result');
  box.className = 'result';
  box.innerHTML = `
    <section class="preview">
      <div class="preview-head">
        <strong class="preview-title">成效預覽</strong>
        <button id="rerun" class="pill-btn" type="button">${RELOAD_ICON}重新讀取</button>
      </div>
      <p class="preview-sub">${esc(dateLine)}｜已選 ${state.selected.size} 個廣告組合</p>
      ${status === 'ok'
        ? `<div class="metric-grid">${metricRows(report).map(([label, value]) =>
            `<div class="metric"><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('')}</div>
           <div class="preview-actions">
             <button id="toText" class="outline" type="button">純文字回報</button>
             <button id="toImage" class="primary" type="button">圖片回報</button>
           </div>`
        : `<p class="report-msg">${esc(card.message)}</p>`}
    </section>
    <div id="reportOutput" class="report-output"></div>`;

  $('rerun').onclick = () => runReport();
  if (status !== 'ok') return;
  $('toText').onclick = showTextReport;
  $('toImage').onclick = showImageReport;
}

function setOutputMode(mode) {
  $('toText').classList.toggle('is-active', mode === 'text');
  $('toImage').classList.toggle('is-active', mode === 'image');
}

function showTextReport() {
  setOutputMode('text');
  $('reportOutput').innerHTML = reportCard(preview.card, 0);
  wireCopyButtons($('reportOutput'));
  $('reportOutput').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function showImageReport() {
  setOutputMode('image');
  if (!preview.image) {
    loading(true);
    try {
      preview.image = await buildReportImage(preview.card);
    } catch (e) {
      loading(false);
      return toast(`圖片產生失敗：${e.message}`);
    }
    loading(false);
  }
  renderImageCard();
  $('reportOutput').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderImageCard() {
  const { card, image } = preview;
  $('reportOutput').innerHTML = `
    <article class="report${card.reported ? ' is-reported' : ''}">
      <div class="report-head">
        <div class="report-title">
          <strong>${esc(card.campaign.name)}</strong>
          <span class="type-badge type-image">圖片回報</span>
        </div>
        ${statusPill(card)}
      </div>
      <img class="report-image" src="${image.dataUrl}" alt="${esc(card.campaign.name)} 成效回報圖片">
      <p class="hint report-hint">也可以長按圖片，直接儲存到相簿</p>
      <button id="downloadImage" class="copy-btn${card.reported ? ' is-done' : ''}" type="button">下載圖片</button>
    </article>`;
  $('downloadImage').onclick = downloadImage;
}

async function downloadImage() {
  const { card, image } = preview;
  const btn = $('downloadImage');
  if (btn.disabled) return;
  btn.disabled = true;

  downloadBlob(image.blob, image.file.name);

  if (card.reported) {
    btn.disabled = false;
    return toast('圖片已下載');
  }
  try {
    await markReported(card, { format: 'image' });
    renderImageCard();
    toast('圖片已下載，已標記為已回報。');
  } catch (e) {
    btn.disabled = false;
    toast(`圖片已下載，但標記已回報失敗：${e.message}`);
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ── 回報圖片（JPG）─────────────────────────────────────────
// 以 canvas 繪製，1080px 寬，適合 LINE／IG；高度依廣告名稱行數與指標數自動計算。

const IMG = {
  width: 1080, pad: 72, gap: 24, tileH: 188, radius: 28,
  brand: '#ff6500', brandSoft: '#fff4ec', text: '#171717', text2: '#5b5b5b', text3: '#8b8b8b',
  surface2: '#f8f9fa', line: '#e6e7ea',
};

async function buildReportImage(card) {
  if (document.fonts?.ready) await document.fonts.ready;
  const family = getComputedStyle(document.documentElement).fontFamily;
  const font = (weight, size) => `${weight} ${size}px ${family}`;
  const { heading, dateLine } = periodLabels(card.period.startDate, card.period.endDate);
  const rows = metricRows(card.report);
  const W = IMG.width;
  const P = IMG.pad;
  const inner = W - P * 2;

  const measure = document.createElement('canvas').getContext('2d');
  measure.font = font(800, 60);
  const titleLines = wrapText(measure, card.campaign.name, inner);
  const tileRows = Math.ceil(rows.length / 2);

  const layout = {
    eyebrow: P + 16 + 40,
    title: P + 16 + 40 + 44,
  };
  layout.date = layout.title + titleLines.length * 76 + 20;
  layout.tiles = layout.date + 100;
  layout.footer = layout.tiles + tileRows * IMG.tileH + (tileRows - 1) * IMG.gap + 72;
  const H = layout.footer + P;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = IMG.brand;
  ctx.fillRect(0, 0, W, 16);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = IMG.brand;
  ctx.font = font(800, 34);
  ctx.fillText(heading, P, layout.eyebrow);

  ctx.fillStyle = IMG.text;
  ctx.font = font(800, 60);
  titleLines.forEach((line, i) => ctx.fillText(line, P, layout.title + 60 + i * 76));

  ctx.fillStyle = IMG.text2;
  ctx.font = font(500, 34);
  ctx.fillText(dateLine, P, layout.date + 34);

  const tileW = (inner - IMG.gap) / 2;
  rows.forEach(([label, value], i) => {
    const x = P + (i % 2) * (tileW + IMG.gap);
    const y = layout.tiles + Math.floor(i / 2) * (IMG.tileH + IMG.gap);
    roundRect(ctx, x, y, tileW, IMG.tileH, IMG.radius);
    ctx.fillStyle = IMG.surface2;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = IMG.line;
    ctx.stroke();

    ctx.fillStyle = IMG.text3;
    ctx.font = font(700, 30);
    ctx.fillText(label, x + 36, y + 64);

    ctx.fillStyle = IMG.text;
    ctx.font = font(800, fitFont(ctx, value, tileW - 72, 64, family));
    ctx.fillText(value, x + 36, y + 146);
  });

  ctx.fillStyle = IMG.text3;
  ctx.font = font(500, 26);
  const now = new Date();
  ctx.fillText(`資料來源：Meta 廣告　產出時間 ${toYmd(now).replaceAll('-', '/')} ${pad(now.getHours())}:${pad(now.getMinutes())}`, P, layout.footer);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('無法輸出 JPG'))), 'image/jpeg', 0.92));
  // 檔名只用 ASCII：部分瀏覽器遇到中文檔名會退回成「download」
  const filename = `ad-report_${card.period.startDate}_${card.period.endDate}_${card.campaign.id}.jpg`;
  const file = new File([blob], filename, { type: 'image/jpeg' });
  return { dataUrl, blob, file, width: W, height: H };
}

// 中英混排逐字斷行（中文沒有空白可斷）
function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      lines.push(line);
      line = ch.trimStart();
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// 數值太長（例如 NT$ 1,234,567）時縮小字級，避免超出格子
function fitFont(ctx, text, maxWidth, size, family) {
  let s = size;
  ctx.font = `800 ${s}px ${family}`;
  while (s > 36 && ctx.measureText(text).width > maxWidth) {
    s -= 2;
    ctx.font = `800 ${s}px ${family}`;
  }
  return s;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
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
