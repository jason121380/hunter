import { query } from '../db.js';

export async function listClients() {
  const result = await query(`
    SELECT c.id, c.name, c.sort_order,
           a.id AS ad_account_row_id, a.external_account_id, a.meta_name, a.display_name
    FROM clients c
    JOIN ad_accounts a ON a.client_id = c.id
    WHERE c.active = TRUE AND a.active = TRUE AND a.platform = 'META'
    ORDER BY c.sort_order ASC, c.name ASC
  `);
  return result.rows.map(row => ({
    id: String(row.id),
    name: row.name,
    accountId: row.external_account_id,
    metaName: row.meta_name,
    displayName: row.display_name || row.name,
  }));
}

export async function getClient(clientId) {
  const result = await query(`
    SELECT c.id, c.name, a.external_account_id, a.meta_name, a.display_name
    FROM clients c
    JOIN ad_accounts a ON a.client_id = c.id
    WHERE c.id = $1 AND c.active = TRUE AND a.active = TRUE AND a.platform = 'META'
    LIMIT 1
  `, [clientId]);
  const row = result.rows[0];
  return row ? {
    id: String(row.id), name: row.name, accountId: row.external_account_id,
    metaName: row.meta_name, displayName: row.display_name || row.name,
  } : null;
}
