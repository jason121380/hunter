import { config } from '../config.js';

function assertMetaConfig() {
  if (!config.meta.accessToken) throw new Error('META_ACCESS_TOKEN 尚未設定。');
}

export async function metaGet(path, params = {}) {
  assertMetaConfig();

  const cleanPath = String(path || '').replace(/^\/+/, '');
  const url = new URL(
    `https://graph.facebook.com/${config.meta.apiVersion}/${cleanPath}`
  );

  for (const [key, value] of Object.entries({
    ...params,
    access_token: config.meta.accessToken,
  })) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url);
  const body = await response.text();

  if (!response.ok) {
    let detail = body;
    try {
      detail = JSON.parse(body).error?.message || detail;
    } catch {}
    throw new Error(`Meta API 錯誤 ${response.status}：${detail}`);
  }

  return JSON.parse(body);
}

export async function metaGetAll(path, params = {}) {
  const first = await metaGet(path, params);
  const rows = Array.isArray(first.data) ? [...first.data] : [];
  let next = first.paging?.next || '';
  let pages = 1;

  while (next) {
    if (pages >= 50) throw new Error('Meta API 分頁超過安全上限 50 頁。');

    const response = await fetch(next);
    if (!response.ok) throw new Error(`Meta API 分頁錯誤 ${response.status}`);

    const data = await response.json();
    if (Array.isArray(data.data)) rows.push(...data.data);
    next = data.paging?.next || '';
    pages += 1;
  }

  return rows;
}

export async function getTokenStatus() {
  const { accessToken, appId, appSecret, apiVersion } = config.meta;

  if (!accessToken) throw new Error('META_ACCESS_TOKEN 尚未設定。');
  if (!appId || !appSecret) {
    throw new Error('META_APP_ID / META_APP_SECRET 尚未設定。');
  }

  const url = new URL(
    `https://graph.facebook.com/${apiVersion}/debug_token`
  );

  url.searchParams.set('input_token', accessToken);
  url.searchParams.set('access_token', `${appId}|${appSecret}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Meta Token 檢查失敗 ${response.status}`);
  }

  const payload = await response.json();
  const data = payload.data || {};
  const expiresAt = Number(data.expires_at || 0);

  return {
    isValid: data.is_valid === true,
    expiresAt,
    remainingDays: expiresAt
      ? Math.max(0, Math.ceil((expiresAt * 1000 - Date.now()) / 86400000))
      : null,
  };
}
