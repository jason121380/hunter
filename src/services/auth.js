import crypto from 'node:crypto';
import { query } from '../db.js';
import { config } from '../config.js';
import { httpError } from '../errors.js';

const COOKIE_NAME = 'hunter_session';
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const MIN_SECRET_LENGTH = 32;
export const MIN_PASSWORD_LENGTH = 6;

export function getSessionSecret() {
  const value = config.sessionSecret;
  if (!value) {
    throw httpError(503, 'SESSION_SECRET 尚未設定，登入功能停用。請在 Railway Variables 新增 SESSION_SECRET。');
  }
  return value;
}

export function validateAuthConfig() {
  const issues = [];

  if (!config.sessionSecret) {
    issues.push('SESSION_SECRET 未設定：所有登入請求會回應 503。');
  } else if (config.sessionSecret.length < MIN_SECRET_LENGTH) {
    issues.push(`SESSION_SECRET 長度僅 ${config.sessionSecret.length} 字元，建議至少 ${MIN_SECRET_LENGTH} 字元。`);
  }

  if (!config.defaultAdmin.password) {
    issues.push('DEFAULT_ADMIN_PASSWORD 未設定：不會建立預設管理員帳號。');
  } else if (config.defaultAdmin.password.length < MIN_PASSWORD_LENGTH) {
    issues.push(`DEFAULT_ADMIN_PASSWORD 長度僅 ${config.defaultAdmin.password.length} 字元，必須至少 ${MIN_PASSWORD_LENGTH} 字元。`);
  }

  return issues;
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('base64url')) {
  const derived = crypto.scryptSync(String(password), salt, 64).toString('base64url');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, expected] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;

  try {
    const actual = crypto.scryptSync(String(password), salt, 64);
    const expectedBuffer = Buffer.from(expected, 'base64url');
    return actual.length === expectedBuffer.length &&
      crypto.timingSafeEqual(actual, expectedBuffer);
  } catch {
    return false;
  }
}

export async function ensureDefaultAdmin() {
  const { username, password, rotate } = config.defaultAdmin;

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return { created: false, skipped: true, reason: 'DEFAULT_ADMIN_PASSWORD 未設定或長度不足。' };
  }

  const existing = await query(
    'SELECT id, username, password_hash FROM users WHERE username=$1 LIMIT 1',
    [username]
  );

  if (existing.rows[0]) {
    // 系統目前沒有改密碼介面，因此提供 DEFAULT_ADMIN_PASSWORD_ROTATE
    // 讓既有帳號（例如早期建立的弱密碼帳號）能透過環境變數輪替密碼。
    if (!existing.rows[0].password_hash || rotate) {
      await query(
        `UPDATE users SET password_hash=$1, active=TRUE, role='ADMIN', updated_at=NOW() WHERE id=$2`,
        [hashPassword(password), existing.rows[0].id]
      );
      return {
        created: false,
        username,
        passwordRotated: Boolean(existing.rows[0].password_hash && rotate),
        passwordInitialized: !existing.rows[0].password_hash,
      };
    }
    return { created: false, username };
  }

  await query(
    `INSERT INTO users (email, username, password_hash, display_name, role, active)
     VALUES ($1, $2, $3, $4, 'ADMIN', TRUE)`,
    [`${username}@local.invalid`, username, hashPassword(password), 'Admin']
  );

  return { created: true, username };
}

export async function authenticate(username, password) {
  const result = await query(
    `SELECT id, username, display_name, role, active, password_hash
     FROM users
     WHERE username=$1
     LIMIT 1`,
    [String(username || '').trim()]
  );

  const user = result.rows[0];
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
    return null;
  }

  return {
    id: String(user.id),
    username: user.username,
    displayName: user.display_name,
    role: user.role,
  };
}

function sign(encodedPayload) {
  return crypto
    .createHmac('sha256', getSessionSecret())
    .update(encodedPayload)
    .digest('base64url');
}

export function createSessionToken(user) {
  const payload = {
    uid: String(user.id),
    username: user.username,
    displayName: user.displayName || '',
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(token) {
  const [encoded, signature, extra] = String(token || '').split('.');
  if (!encoded || !signature || extra !== undefined) return null;

  const expected = sign(encoded);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!payload || typeof payload !== 'object') return null;
  if (!payload.uid || !['ADMIN', 'STAFF'].includes(payload.role)) return null;
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function parseCookies(req) {
  const output = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    const value = part.slice(idx + 1).trim();
    try {
      output[key] = decodeURIComponent(value);
    } catch {
      output[key] = value;
    }
  }
  return output;
}

export function getSessionUser(req) {
  return verifySessionToken(parseCookies(req)[COOKIE_NAME]);
}

function cookieFlags(req) {
  const secure = req.secure || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export function setSessionCookie(req, res, token) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; ${cookieFlags(req)}; Max-Age=${SESSION_TTL_SECONDS}`
  );
}

export function clearSessionCookie(req, res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; ${cookieFlags(req)}; Max-Age=0`);
}

function denyRequest(req, res) {
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'unauthorized', message: '請先登入。' });
  }
  return res.redirect('/login');
}

// Session token 只用來證明「是誰」；帳號是否啟用、目前角色一律以資料庫為準，
// 這樣管理員停用或降級某個帳號時才會立即生效，而不是等 token 過期。
export async function requireLogin(req, res, next) {
  let payload = null;
  try {
    payload = getSessionUser(req);
  } catch (error) {
    return next(error);
  }

  if (!payload) return denyRequest(req, res);

  try {
    const result = await query(
      `SELECT id, username, display_name, role, active,
              (password_hash IS NOT NULL) AS has_password
       FROM users WHERE id=$1 LIMIT 1`,
      [payload.uid]
    );

    const row = result.rows[0];
    if (!row || !row.active || !row.has_password) {
      clearSessionCookie(req, res);
      return denyRequest(req, res);
    }

    req.user = {
      uid: String(row.id),
      username: row.username || '',
      displayName: row.display_name || '',
      role: row.role,
    };
    next();
  } catch (error) {
    next(error);
  }
}
