import { getTokenStatus, metaGetAll } from './services/meta.js';

export async function runStartupChecks() {
  const result = {
    metaToken: 'unknown',
    adAccountsReadable: false,
    adAccountSampleCount: 0,
  };

  try {
    const token = await getTokenStatus();
    result.metaToken = token.isValid ? 'valid' : 'invalid';

    const accounts = await metaGetAll('me/adaccounts', {
      fields: 'id,name,account_status',
      limit: 5,
    });
    result.adAccountsReadable = true;
    result.adAccountSampleCount = accounts.length;
  } catch (error) {
    console.error('[startup-check] Meta validation failed:', error.message);
  }

  console.log('[startup-check]', JSON.stringify(result));
}
