import { metaGetAll } from './meta.js';
import { query } from '../db.js';

export async function bootstrapMetaAccounts() {
  const accounts = await metaGetAll('me/adaccounts', {
    fields: 'id,name,account_status',
    limit: 500,
  });

  let imported = 0;
  let existing = 0;

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    if (!account?.id) continue;

    const accountId = String(account.id);
    const metaName = String(account.name || accountId);

    const found = await query(
      `SELECT id, client_id, display_name
       FROM ad_accounts
       WHERE platform='META' AND external_account_id=$1
       LIMIT 1`,
      [accountId]
    );

    if (found.rows[0]) {
      await query(
        `UPDATE ad_accounts
         SET meta_name=$1, active=TRUE, updated_at=NOW()
         WHERE id=$2`,
        [metaName, found.rows[0].id]
      );
      existing += 1;
      continue;
    }

    const client = await query(
      `INSERT INTO clients (name, active, sort_order)
       VALUES ($1, TRUE, $2)
       RETURNING id`,
      [metaName, i + 1]
    );

    await query(
      `INSERT INTO ad_accounts
         (client_id, platform, external_account_id, meta_name, display_name, active)
       VALUES ($1, 'META', $2, $3, $3, TRUE)`,
      [client.rows[0].id, accountId, metaName]
    );

    imported += 1;
  }

  return {
    totalReadable: accounts.length,
    imported,
    existing,
  };
}
