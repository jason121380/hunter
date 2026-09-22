const $ = id => document.getElementById(id);
const state = { users: [], clients: [], editing: null };

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function loading(on) { $('loading').hidden = !on; }
function toast(text) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  setTimeout(() => { $('toast').hidden = true; }, 2600);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (res.status === 401) { location.href = '/login'; throw new Error('請先登入。'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || '系統錯誤');
  return data;
}

$('home').onclick = () => { location.href = '/'; };
$('logout').onclick = async () => {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  location.href = '/login';
};
$('reload').onclick = () => load();
$('new').onclick = () => openCreate();

async function load() {
  loading(true);
  $('listError').innerHTML = '';
  try {
    const data = await api('/api/admin/users');
    state.users = data.users;
    state.clients = data.clients;
    renderList();
  } catch (error) {
    $('listError').innerHTML = `<div class="error-box">${esc(error.message)}</div>`;
  } finally {
    loading(false);
  }
}

function accountSummary(user) {
  if (user.role === 'ADMIN') return '可檢視全部廣告帳號';
  if (!user.clientIds.length) return '尚未指派廣告帳號';
  return `可檢視 ${user.clientIds.length} 個廣告帳號`;
}

function renderList() {
  $('list').innerHTML = state.users.map(u => `
    <button class="user" type="button" data-id="${esc(u.id)}">
      <span class="top">
        <b>${esc(u.displayName || u.username)}</b>
        <span class="badge ${u.role === 'ADMIN' ? 'admin' : ''}">${u.role === 'ADMIN' ? '管理員' : '一般使用者'}</span>
        ${u.active ? '' : '<span class="badge off">已停用</span>'}
        ${u.hasPassword ? '' : '<span class="badge off">未設密碼</span>'}
      </span>
      <span class="meta">帳號：${esc(u.username)}</span>
      <span class="meta">${esc(accountSummary(u))}</span>
    </button>
  `).join('') || '<p class="meta">尚無使用者。</p>';

  document.querySelectorAll('.user').forEach(button => {
    button.onclick = () => openEdit(state.users.find(u => u.id === button.dataset.id));
  });
}

function accountPicker(selectedIds, disabled) {
  if (!state.clients.length) {
    return '<div class="note">目前系統內沒有廣告帳號。請先在 Meta Token 設定完成後匯入帳號。</div>';
  }
  const selected = new Set(selectedIds || []);
  return `
    <div class="row" style="margin-top:8px">
      <button type="button" class="outline" id="selectAll" ${disabled ? 'disabled' : ''}>全選</button>
      <button type="button" class="outline" id="selectNone" ${disabled ? 'disabled' : ''}>全部取消</button>
    </div>
    <div class="accounts">
      ${state.clients.map(c => `
        <label class="acct">
          <input type="checkbox" class="acctBox" value="${esc(c.id)}"
            ${selected.has(c.id) ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
          <span style="color:#171717;font-weight:700">${esc(c.name)}
            <span>${esc(c.accountId)}${c.metaName && c.metaName !== c.name ? ' ｜ ' + esc(c.metaName) : ''}</span>
          </span>
        </label>
      `).join('')}
    </div>`;
}

function pickedClientIds() {
  return [...document.querySelectorAll('.acctBox:checked')].map(box => box.value);
}

function wirePicker() {
  const all = $('selectAll');
  const none = $('selectNone');
  if (all) all.onclick = () => document.querySelectorAll('.acctBox').forEach(b => { b.checked = true; });
  if (none) none.onclick = () => document.querySelectorAll('.acctBox').forEach(b => { b.checked = false; });
}

function roleNote(role) {
  return role === 'ADMIN'
    ? '<div class="note">管理員可檢視所有廣告帳號，並能管理使用者與 Meta Token，因此不需要指派帳號。</div>'
    : '';
}

function openCreate() {
  state.editing = null;
  $('panel').hidden = false;
  $('panel').innerHTML = `
    <h2>新增使用者</h2>
    <label class="field">帳號（登入用）
      <input type="text" id="f_username" autocomplete="off" placeholder="例如 staff01">
    </label>
    <label class="field">顯示名稱
      <input type="text" id="f_display" autocomplete="off" placeholder="例如 王小明">
    </label>
    <label class="field">角色
      <select id="f_role">
        <option value="STAFF">一般使用者</option>
        <option value="ADMIN">管理員</option>
      </select>
    </label>
    <label class="field">密碼（至少 6 字元）
      <input type="password" id="f_password" autocomplete="new-password">
    </label>
    <label class="field">可檢視的廣告帳號</label>
    <div id="picker">${accountPicker([], false)}</div>
    <div id="roleNote"></div>
    <div class="actions">
      <button class="primary" type="button" id="save">建立帳號</button>
      <button class="outline" type="button" id="cancel">取消</button>
    </div>`;
  wirePicker();

  $('f_role').onchange = () => {
    const isAdmin = $('f_role').value === 'ADMIN';
    $('picker').innerHTML = accountPicker(pickedClientIds(), isAdmin);
    $('roleNote').innerHTML = roleNote($('f_role').value);
    wirePicker();
  };
  $('cancel').onclick = closePanel;
  $('save').onclick = submitCreate;
  $('panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function submitCreate() {
  loading(true);
  try {
    await api('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        username: $('f_username').value.trim(),
        displayName: $('f_display').value.trim(),
        role: $('f_role').value,
        password: $('f_password').value,
        clientIds: $('f_role').value === 'ADMIN' ? [] : pickedClientIds(),
      }),
    });
    toast('已建立帳號');
    closePanel();
    await load();
  } catch (error) {
    toast(error.message);
  } finally {
    loading(false);
  }
}

function openEdit(user) {
  if (!user) return;
  state.editing = user;
  const isAdmin = user.role === 'ADMIN';

  $('panel').hidden = false;
  $('panel').innerHTML = `
    <h2>編輯：${esc(user.username)}</h2>
    <label class="field">顯示名稱
      <input type="text" id="f_display" value="${esc(user.displayName)}">
    </label>
    <label class="field">角色
      <select id="f_role">
        <option value="STAFF" ${isAdmin ? '' : 'selected'}>一般使用者</option>
        <option value="ADMIN" ${isAdmin ? 'selected' : ''}>管理員</option>
      </select>
    </label>
    <label class="field">狀態
      <select id="f_active">
        <option value="true" ${user.active ? 'selected' : ''}>啟用</option>
        <option value="false" ${user.active ? '' : 'selected'}>停用（無法登入）</option>
      </select>
    </label>
    <label class="field">可檢視的廣告帳號</label>
    <div id="picker">${accountPicker(user.clientIds, isAdmin)}</div>
    <div id="roleNote">${roleNote(user.role)}</div>
    <div class="actions">
      <button class="primary" type="button" id="save">儲存變更</button>
      <button class="outline" type="button" id="cancel">取消</button>
    </div>

    <label class="field" style="margin-top:26px">重設密碼（至少 6 字元）
      <input type="password" id="f_password" autocomplete="new-password" placeholder="留空則不變更">
    </label>
    <div class="actions">
      <button class="outline" type="button" id="resetPw">更新密碼</button>
      <button class="danger" type="button" id="remove">刪除此帳號</button>
    </div>`;
  wirePicker();

  $('f_role').onchange = () => {
    const nowAdmin = $('f_role').value === 'ADMIN';
    $('picker').innerHTML = accountPicker(pickedClientIds(), nowAdmin);
    $('roleNote').innerHTML = roleNote($('f_role').value);
    wirePicker();
  };
  $('cancel').onclick = closePanel;
  $('save').onclick = () => submitEdit(user);
  $('resetPw').onclick = () => submitPassword(user);
  $('remove').onclick = () => submitDelete(user);
  $('panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function submitEdit(user) {
  loading(true);
  try {
    const role = $('f_role').value;
    await api(`/api/admin/users/${encodeURIComponent(user.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        displayName: $('f_display').value.trim() || user.username,
        role,
        active: $('f_active').value === 'true',
        clientIds: role === 'ADMIN' ? [] : pickedClientIds(),
      }),
    });
    toast('已儲存');
    closePanel();
    await load();
  } catch (error) {
    toast(error.message);
  } finally {
    loading(false);
  }
}

async function submitPassword(user) {
  const password = $('f_password').value;
  if (!password) return toast('請先輸入新密碼');
  loading(true);
  try {
    await api(`/api/admin/users/${encodeURIComponent(user.id)}/password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    $('f_password').value = '';
    toast('密碼已更新');
  } catch (error) {
    toast(error.message);
  } finally {
    loading(false);
  }
}

async function submitDelete(user) {
  if (!confirm(`確定要刪除「${user.displayName || user.username}」嗎？此動作無法復原。`)) return;
  loading(true);
  try {
    await api(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' });
    toast('已刪除帳號');
    closePanel();
    await load();
  } catch (error) {
    toast(error.message);
  } finally {
    loading(false);
  }
}

function closePanel() {
  state.editing = null;
  $('panel').hidden = true;
  $('panel').innerHTML = '';
}

load();
