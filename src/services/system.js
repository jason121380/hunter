import { query } from '../db.js';
import { getTokenStatus, metaGetAll } from './meta.js';

export async function getSystemStatus() {
  const result = {
    ok: true,
    database: { ok: false },
    meta: { ok: false, tokenValid: false, adAccountsReadable: false, adAccountCount: 0 },
  };

  try {
    await query('SELECT 1');
    result.database.ok = true;
  } catch (error) {
    result.ok = false;
    result.database.error = error.message;
  }

  try {
    const token = await getTokenStatus();
    result.meta.tokenValid = token.isValid === true;

    const accounts = await metaGetAll('me/adaccounts', {
      fields: 'id',
      limit: 500,
    });

    result.meta.ok = token.isValid === true;
    result.meta.adAccountsReadable = true;
    result.meta.adAccountCount = accounts.length;
  } catch (error) {
    result.ok = false;
    result.meta.error = error.message;
  }

  return result;
}
