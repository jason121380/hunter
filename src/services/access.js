import { query } from '../db.js';
import { httpError } from '../errors.js';

export function isAdmin(user) {
  return user?.role === 'ADMIN';
}

// STAFF 只能操作被指派的客戶；ADMIN 不受限制。
// 這是授權邊界：每個接受 clientId / accountId 的 API 都必須先過這裡，
// 否則使用者可以直接帶入別人的 ID 繞過前端的清單限制。
export async function assertClientAllowed(user, clientId) {
  if (isAdmin(user)) return;

  const result = await query(
    'SELECT 1 FROM user_clients WHERE user_id=$1 AND client_id=$2 LIMIT 1',
    [user.uid, clientId]
  );

  if (!result.rows[0]) {
    throw httpError(403, '你沒有檢視此客戶的權限。');
  }
}

export async function assertAccountAllowed(user, accountId) {
  const result = await query(
    `SELECT a.client_id
     FROM ad_accounts a
     JOIN clients c ON c.id = a.client_id
     WHERE a.platform='META' AND a.external_account_id=$1
       AND a.active = TRUE AND c.active = TRUE
     LIMIT 1`,
    [accountId]
  );

  const row = result.rows[0];
  if (!row) throw httpError(404, '找不到此廣告帳號。');

  await assertClientAllowed(user, row.client_id);
  return String(row.client_id);
}
