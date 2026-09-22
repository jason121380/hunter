import { metaGetAll } from './meta.js';
import { query } from '../db.js';

export async function bootstrapMetaAccounts() {
  const existing = await query(`SELECT COUNT(*)::int AS count FROM ad_accounts WHERE platform='META'`);
  if (existing.rows[0].count > 0) {
    return { skipped: true, reason: 'meta_accounts_exist', count: existing.rows[0].count };
  }

  const accounts = await metaGetAll('me/adaccounts', {
    fields: 'id,name,account_status',
    limit: 500,
  });

  let imported = 0;
  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    if (!account?.id) continue;
    const name = String(account.name || account.id);

    const client = await query(`
      INSERT INTO clients (name, active, sort_order)
      VALUES ($1, TRUE, $2)
      RETURNING id
    `, [name, i + 1]);

    await query(`
      INSERT INTO ad_accounts
        (client_id, platform, external_account_id, meta_name, display_name, active)
      VALUES ($1, 'META', $2, $3, $3, TRUE)
      ON CONFLICT (platform, external_account_id) DO NOTHING
    `, [client.rows[0].id, String(account.id), name]);
    imported += 1;
  }
  return { skipped: false, imported };
}
