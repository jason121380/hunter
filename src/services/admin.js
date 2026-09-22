import { query } from '../db.js';

export async function importMetaAccounts(accounts) {
  if (!Array.isArray(accounts)) throw new Error('accounts 必須是陣列。');

  const imported = [];

  for (let i = 0; i < accounts.length; i++) {
    const item = accounts[i] || {};
    const accountId = String(item.accountId || '').trim();
    const displayName = String(item.displayName || item.metaName || '').trim();
    const metaName = String(item.metaName || '').trim();
    const active = item.active !== false;

    if (!accountId || !displayName) continue;

    const existing = await query(`
      SELECT a.id AS ad_account_id, a.client_id
      FROM ad_accounts a
      WHERE a.platform='META' AND a.external_account_id=$1
      LIMIT 1
    `, [accountId]);

    let clientId;

    if (existing.rows[0]) {
      clientId = existing.rows[0].client_id;

      await query(`
        UPDATE clients
        SET name=$1, active=$2, sort_order=$3, updated_at=NOW()
        WHERE id=$4
      `, [displayName, active, i + 1, clientId]);

      await query(`
        UPDATE ad_accounts
        SET meta_name=$1, display_name=$2, active=$3, updated_at=NOW()
        WHERE id=$4
      `, [metaName, displayName, active, existing.rows[0].ad_account_id]);
    } else {
      const clientResult = await query(`
        INSERT INTO clients (name, active, sort_order)
        VALUES ($1, $2, $3)
        RETURNING id
      `, [displayName, active, i + 1]);

      clientId = clientResult.rows[0].id;

      await query(`
        INSERT INTO ad_accounts
          (client_id, platform, external_account_id, meta_name, display_name, active)
        VALUES ($1, 'META', $2, $3, $4, $5)
      `, [clientId, accountId, metaName, displayName, active]);
    }

    imported.push({ clientId: String(clientId), accountId, displayName, active });
  }

  return imported;
}
