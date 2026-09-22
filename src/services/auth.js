import crypto from 'node:crypto';
import { query } from '../db.js';

const COOKIE_NAME = 'hunter_session';
const SESSION_TTL_SECONDS = 12 * 60 * 60;

function getSessionSecret() {
  const value = process.env.SESSION_SECRET || process.env.ADMIN_KEY || '';
  if (!value) throw new Error('SESSION_SECRET / ADMIN_KEY 尚未設定。');
  return value;
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('base64url')) {
  const derived = crypto.scryptSync(String(password), salt, 64).toString('base64url');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, expected] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;

  const actual = crypto.scryptSync(String(password), salt, 64);
  const expectedBuffer = Buffer.from(expected, 'base64url');
  return actual.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actual, expectedBuffer);
}

export async function ensureDefaultAdmin() {
  const username = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
  const password = process.env.DEFAULT_ADMIN_PASSWORD || '1234';

  const existing = await query(
    'SELECT id, username, password_hash FROM users WHERE username=$1 LIMIT 1',
    [username]
  );

  if (existing.rows[0]) {
    if (!existing.rows[0].password_hash) {
      await query(
        'UPDATE users SET password_hash=$1, active=TRUE, role=\'ADMIN\', updated_at=NOW() WHERE id=$2',
        [hashPassword(password), existing.rows[0].id]
      );
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
  const [encoded, signature] = String(token || '').split('.');
  if (!encoded || !signature) return null;

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
    const value = part.slice(idx + 1).trim();
    if (key) output[key] = decodeURIComponent(value);
  }
  return output;
}

export function getSessionUser(req) {
  return verifySessionToken(parseCookies(req)[COOKIE_NAME]);
}

export function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`
  );
}

export function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  );
}

export function requireLogin(req, res, next) {
  try {
    const user = getSessionUser(req);
    if (!user) {
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'unauthorized', message: '請先登入。' });
      }
      return res.redirect('/login');
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}
