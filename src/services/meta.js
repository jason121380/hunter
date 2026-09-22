import { config } from '../config.js';
import { httpError } from '../errors.js';

const GRAPH_HOST = 'graph.facebook.com';
const SAFE_PATH_RE = /^[A-Za-z0-9_.\-/]+$/;
const MAX_PAGES = 50;

function assertMetaConfig() {
  if (!config.meta.accessToken) {
    throw httpError(503, 'META_ACCESS_TOKEN 尚未設定。');
  }
}

// 避免把任何 token 值寫進錯誤訊息或 log。
function redact(text) {
  return String(text || '')
    .replace(/access_token=[^&\s"']+/gi, 'access_token=[redacted]')
    .replace(/\b(EAA|EAB)[A-Za-z0-9_-]{20,}/g, '[redacted-token]');
}

function normalizeGraphPath(value) {
  let clean = String(value || '');
  while (clean.startsWith('/')) clean = clean.slice(1);

  if (!clean || !SAFE_PATH_RE.test(clean) || clean.includes('..')) {
    throw httpError(400, 'Meta API 路徑含有不合法字元。');
  }
  return clean;
}

export async function metaGet(path, params = {}) {
  assertMetaConfig();

  const cleanPath = normalizeGraphPath(path);
  const url = new URL(`https://${GRAPH_HOST}/${config.meta.apiVersion}/${cleanPath}`);

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
    throw httpError(502, `Meta API 錯誤 ${response.status}：${redact(detail).slice(0, 400)}`);
  }

  try {
    return JSON.parse(body);
  } catch {
    throw httpError(502, 'Meta API 回傳非 JSON 內容。');
  }
}

export async function metaGetAll(path, params = {}) {
  const first = await metaGet(path, params);
  const rows = Array.isArray(first.data) ? [...first.data] : [];
  let next = first.paging?.next || '';
  let pages = 1;

  while (next) {
    if (pages >= MAX_PAGES) {
      throw httpError(502, `Meta API 分頁超過安全上限 ${MAX_PAGES} 頁。`);
    }

    // 只跟隨指向 Graph API 的分頁連結，避免被導去其他主機。
    let nextUrl;
    try {
      nextUrl = new URL(next);
    } catch {
      throw httpError(502, 'Meta API 分頁連結格式不正確。');
    }
    if (nextUrl.protocol !== 'https:' || nextUrl.host !== GRAPH_HOST) {
      throw httpError(502, 'Meta API 分頁連結指向非預期主機，已中止。');
    }

    const response = await fetch(nextUrl);
    if (!response.ok) {
      throw httpError(502, `Meta API 分頁錯誤 ${response.status}`);
    }

    const data = await response.json();
    if (Array.isArray(data.data)) rows.push(...data.data);
    next = data.paging?.next || '';
    pages += 1;
  }

  return rows;
}

export async function getTokenStatus() {
  const { accessToken, appId, appSecret, apiVersion } = config.meta;

  if (!accessToken) throw httpError(503, 'META_ACCESS_TOKEN 尚未設定。');
  if (!appId || !appSecret) {
    throw httpError(503, 'META_APP_ID / META_APP_SECRET 尚未設定。');
  }

  const url = new URL(`https://${GRAPH_HOST}/${apiVersion}/debug_token`);
  url.searchParams.set('input_token', accessToken);
  url.searchParams.set('access_token', `${appId}|${appSecret}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw httpError(502, `Meta Token 檢查失敗 ${response.status}`);
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

export async function exchangeUserToken(shortToken) {
  const { appId, appSecret, apiVersion } = config.meta;
  if (!shortToken) throw httpError(400, '請提供短效 User Access Token。');
  if (!appId || !appSecret) throw httpError(503, 'META_APP_ID / META_APP_SECRET 尚未設定。');

  const url = new URL(`https://${GRAPH_HOST}/${apiVersion}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('fb_exchange_token', shortToken);

  const response = await fetch(url);
  const body = await response.text();
  let payload = {};
  try { payload = JSON.parse(body); } catch {}

  if (!response.ok || !payload.access_token) {
    const detail = payload.error?.message || `HTTP ${response.status}`;
    throw httpError(502, `Meta Token 交換失敗：${redact(detail).slice(0, 400)}`);
  }

  return {
    accessToken: payload.access_token,
    tokenType: payload.token_type || 'bearer',
    expiresIn: Number(payload.expires_in || 0),
    expiresInDays: payload.expires_in
      ? Math.round((Number(payload.expires_in) / 86400) * 10) / 10
      : null,
  };
}
