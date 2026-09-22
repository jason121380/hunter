import { query, withTransaction } from '../db.js';
import { httpError } from '../errors.js';
import { hashPassword, MIN_PASSWORD_LENGTH } from './auth.js';
import { requireId, requireEnum, requireText, optionalText } from '../validate.js';

const ROLES = ['ADMIN', 'STAFF'];
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,50}$/;

function requireUsername(value) {
  const text = String(value ?? '').trim();
  if (!USERNAME_RE.test(text)) {
    throw httpError(400, '帳號只能使用英數字、底線、點與減號，長度 3–50 字元。');
  }
  return text;
}

function requirePassword(value) {
  const text = String(value ?? '');
  if (text.length < MIN_PASSWORD_LENGTH) {
    throw httpError(400, `密碼至少需要 ${MIN_PASSWORD_LENGTH} 字元。`);
  }
  if (text.length > 512) throw httpError(400, '密碼長度不可超過 512 字元。');
  return text;
}

async function activeAdminCount(excludeUserId = null) {
  const result = await query(
    `SELECT COUNT(*)::int AS count
     FROM users
     WHERE role='ADMIN' AND active=TRUE AND password_hash IS NOT NULL
       AND ($1::bigint IS NULL OR id <> $1)`,
    [excludeUserId]
  );
  return result.rows[0].count;
}

// 避免把系統鎖死：最後一位可登入的管理員不能被停用、降級或刪除。
async function assertNotLastAdmin(userId, action) {
  const target = await query('SELECT role, active FROM users WHERE id=$1', [userId]);
  const row = target.rows[0];
  if (!row || row.role !== 'ADMIN' || !row.active) return;

  if (await activeAdminCount(userId) === 0) {
    throw httpError(409, `無法${action}：系統必須至少保留一位可登入的管理員。`);
  }
}

function assertNotSelf(actorUid, userId, action) {
  if (String(actorUid) === String(userId)) {
    throw httpError(409, `無法${action}自己的帳號。`);
  }
}

export async function listUsers() {
  const result = await query(`
    SELECT u.id, u.username, u.display_name, u.role, u.active, u.created_at,
           (u.password_hash IS NOT NULL) AS has_password,
           COALESCE(
             ARRAY_AGG(uc.client_id ORDER BY uc.client_id) FILTER (WHERE uc.client_id IS NOT NULL),
             '{}'
           ) AS client_ids
    FROM users u
    LEFT JOIN user_clients uc ON uc.user_id = u.id
    GROUP BY u.id
    ORDER BY u.role ASC, u.username ASC
  `);

  return result.rows.map(row => ({
    id: String(row.id),
    username: row.username || '',
    displayName: row.display_name || '',
    role: row.role,
    active: row.active,
    hasPassword: row.has_password,
    createdAt: row.created_at,
    clientIds: row.client_ids.map(String),
  }));
}

export async function listAssignableClients() {
  const result = await query(`
    SELECT c.id, c.name, a.external_account_id, a.meta_name
    FROM clients c
    JOIN ad_accounts a ON a.client_id = c.id
    WHERE c.active = TRUE AND a.active = TRUE AND a.platform = 'META'
  `);

  // 指派用的清單照字元順序排序，不用匯入順序；排序在這裡做，
  // 結果才不會隨資料庫的 collation 設定而改變。
  return result.rows
    .map(row => ({
      id: String(row.id),
      name: row.name,
      accountId: row.external_account_id,
      metaName: row.meta_name || '',
    }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

async function replaceUserClients(client, userId, clientIds) {
  await client.query('DELETE FROM user_clients WHERE user_id=$1', [userId]);
  if (!clientIds.length) return;

  await client.query(
    `INSERT INTO user_clients (user_id, client_id)
     SELECT $1, c.id FROM clients c WHERE c.id = ANY($2::bigint[])`,
    [userId, clientIds]
  );
}

function parseClientIds(value) {
  if (value === undefined) return null;
  if (!Array.isArray(value)) throw httpError(400, 'clientIds 必須是陣列。');
  if (value.length > 1000) throw httpError(400, 'clientIds 最多 1000 筆。');
  return [...new Set(value.map(id => requireId(id, 'clientIds')))];
}

export async function createUser(input) {
  const username = requireUsername(input?.username);
  const displayName = optionalText(input?.displayName, 'displayName', 100) || username;
  const role = requireEnum(input?.role, ROLES, 'role');
  const password = requirePassword(input?.password);
  const clientIds = parseClientIds(input?.clientIds) || [];

  const existing = await query('SELECT id FROM users WHERE username=$1 LIMIT 1', [username]);
  if (existing.rows[0]) throw httpError(409, '此帳號已存在。');

  return withTransaction(async client => {
    const created = await client.query(
      `INSERT INTO users (email, username, password_hash, display_name, role, active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING id`,
      [`${username}@local.invalid`, username, hashPassword(password), displayName, role]
    );

    const userId = created.rows[0].id;
    await replaceUserClients(client, userId, clientIds);
    return { id: String(userId), username, displayName, role, active: true, clientIds };
  });
}

export async function updateUser(actorUid, rawUserId, input) {
  const userId = requireId(rawUserId, 'userId');

  const current = await query('SELECT id, role, active FROM users WHERE id=$1 LIMIT 1', [userId]);
  if (!current.rows[0]) throw httpError(404, '找不到此使用者。');

  const nextRole = input?.role === undefined ? null : requireEnum(input.role, ROLES, 'role');
  const nextActive = input?.active === undefined ? null : Boolean(input.active);
  const nextDisplayName = input?.displayName === undefined
    ? null
    : requireText(input.displayName, 'displayName', 100);

  if (nextRole === 'STAFF' || nextActive === false) {
    assertNotSelf(actorUid, userId, nextActive === false ? '停用' : '降級');
    await assertNotLastAdmin(userId, nextActive === false ? '停用此帳號' : '降級此帳號');
  }

  const clientIds = parseClientIds(input?.clientIds);

  return withTransaction(async client => {
    await client.query(
      `UPDATE users
       SET display_name = COALESCE($1, display_name),
           role         = COALESCE($2, role),
           active       = COALESCE($3, active),
           updated_at   = NOW()
       WHERE id = $4`,
      [nextDisplayName, nextRole, nextActive, userId]
    );

    if (clientIds) await replaceUserClients(client, userId, clientIds);

    const updated = await client.query(
      `SELECT id, username, display_name, role, active FROM users WHERE id=$1`,
      [userId]
    );
    const row = updated.rows[0];
    return {
      id: String(row.id),
      username: row.username,
      displayName: row.display_name,
      role: row.role,
      active: row.active,
    };
  });
}

export async function setUserPassword(rawUserId, password) {
  const userId = requireId(rawUserId, 'userId');
  const value = requirePassword(password);

  const result = await query(
    `UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2 RETURNING username`,
    [hashPassword(value), userId]
  );
  if (!result.rows[0]) throw httpError(404, '找不到此使用者。');

  return { ok: true, username: result.rows[0].username };
}

export async function deleteUser(actorUid, rawUserId) {
  const userId = requireId(rawUserId, 'userId');
  assertNotSelf(actorUid, userId, '刪除');
  await assertNotLastAdmin(userId, '刪除此帳號');

  const result = await query('DELETE FROM users WHERE id=$1 RETURNING username', [userId]);
  if (!result.rows[0]) throw httpError(404, '找不到此使用者。');

  return { ok: true, username: result.rows[0].username };
}
