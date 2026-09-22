import { query } from '../db.js';

export async function importMetaAccounts(accounts) {
  if (!Array.isArray(accounts)) throw new Error('accounts 必須是陣列。');
  const imported = [];
  for (let i = 0; i < accounts.length; i++) {
    const item = accounts[i] || {};
    const accountId = String(item.accountId || '').trim();
    const displayName = String(item.displayName || item.metaName || '').trim();
    const metaName = String(item.metaName || '').trim();
    if (!accountId || !displayName) continue;

    const clientResult = await query(`
      INSERT INTO clients (name, active, sort_order)
      VALUES ($1, TRUE, $2)
      RETURNING id
    `, [displayName, i + 1]);
    const clientId = clientResult.rows[0].id;

    await query(`
      INSERT INTO ad_accounts
        (client_id, platform, external_account_id, meta_name, display_name, active)
      VALUES ($1, 'META', $2, $3, $4, TRUE)
      ON CONFLICT (platform, external_account_id)
      DO UPDATE SET client_id=EXCLUDED.client_id, meta_name=EXCLUDED.meta_name,
                    display_name=EXCLUDED.display_name, active=TRUE, updated_at=NOW()
    `, [clientId, accountId, metaName, displayName]);

    imported.push({ clientId: String(clientId), accountId, displayName });
  }
  return imported;
}
