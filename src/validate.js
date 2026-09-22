import { httpError } from './errors.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function requireId(value, field) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,19}$/.test(text)) {
    throw httpError(400, `${field} 必須是正整數 ID。`);
  }
  return text;
}

export function requireDate(value, field) {
  const text = String(value ?? '').trim();
  if (!DATE_RE.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw httpError(400, `${field} 必須是 YYYY-MM-DD 格式的日期。`);
  }
  return text;
}

export function requireDateRange(startDate, endDate) {
  const start = requireDate(startDate, 'startDate');
  const end = requireDate(endDate, 'endDate');
  if (start > end) throw httpError(400, 'startDate 不可晚於 endDate。');
  return { startDate: start, endDate: end };
}

export function requireEnum(value, allowed, field) {
  const text = String(value ?? '').trim();
  if (!allowed.includes(text)) {
    throw httpError(400, `${field} 必須是 ${allowed.join(' / ')} 其中之一。`);
  }
  return text;
}

export function requireText(value, field, maxLength) {
  const text = String(value ?? '').trim();
  if (!text) throw httpError(400, `${field} 不可為空。`);
  if (text.length > maxLength) throw httpError(400, `${field} 長度不可超過 ${maxLength} 字元。`);
  return text;
}

export function optionalText(value, field, maxLength) {
  const text = String(value ?? '').trim();
  if (text.length > maxLength) throw httpError(400, `${field} 長度不可超過 ${maxLength} 字元。`);
  return text;
}

export function requirePlainObject(value, field, maxBytes = 8192) {
  const input = value ?? {};
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw httpError(400, `${field} 必須是 JSON 物件。`);
  }
  const serialized = JSON.stringify(input);
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
    throw httpError(400, `${field} 超過 ${maxBytes} bytes 上限。`);
  }
  return serialized;
}

export function requireIdList(value, field, maxItems = 100) {
  if (!Array.isArray(value) || value.length === 0) {
    throw httpError(400, `${field} 必須是非空陣列。`);
  }
  if (value.length > maxItems) {
    throw httpError(400, `${field} 最多 ${maxItems} 筆。`);
  }
  return value.map(item => requireId(item, field));
}

// Meta ID 會被插入 Graph API 的 URL 路徑，必須嚴格白名單，
// 避免 `?`、`#`、`../` 之類字元改寫請求目標。
export function requireMetaAccountId(value, field = 'accountId') {
  const text = String(value ?? '').trim();
  if (!/^act_\d{1,20}$/.test(text)) {
    throw httpError(400, `${field} 必須是 act_ 開頭的 Meta 廣告帳號 ID。`);
  }
  return text;
}

export function requireMetaObjectId(value, field) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,20}$/.test(text)) {
    throw httpError(400, `${field} 必須是數字型的 Meta 物件 ID。`);
  }
  return text;
}

export function requireMetaObjectIdList(value, field, maxItems = 100) {
  if (!Array.isArray(value) || value.length === 0) {
    throw httpError(400, `${field} 必須是非空陣列。`);
  }
  if (value.length > maxItems) {
    throw httpError(400, `${field} 最多 ${maxItems} 筆。`);
  }
  return [...new Set(value.map(item => requireMetaObjectId(item, field)))];
}
