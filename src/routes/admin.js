import { Router } from 'express';
import { importMetaAccounts } from '../services/admin.js';
import { bootstrapMetaAccounts } from '../services/bootstrap.js';
import { metaGetAll, exchangeUserToken } from '../services/meta.js';
import { requireAdmin } from '../middleware/admin.js';
import { httpError } from '../errors.js';

export const adminRouter = Router();

adminRouter.use('/admin', requireAdmin);

adminRouter.get('/admin/meta-accounts', async (_req, res, next) => {
  try {
    const accounts = await metaGetAll('me/adaccounts', {
      fields: 'id,name,account_status',
      limit: 500,
    });
    res.json({
      accounts: accounts.map(a => ({
        accountId: String(a.id || ''),
        metaName: a.name || '',
        accountStatus: a.account_status ?? null,
      })),
    });
  } catch (error) { next(error); }
});

adminRouter.post('/admin/import-meta-accounts', async (req, res, next) => {
  try {
    const imported = await importMetaAccounts(req.body?.accounts || []);
    res.status(201).json({ ok: true, count: imported.length, imported });
  } catch (error) { next(error); }
});

adminRouter.post('/admin/bootstrap-meta', async (_req, res, next) => {
  try { res.json(await bootstrapMetaAccounts()); }
  catch (error) { next(error); }
});


adminRouter.post('/admin/exchange-meta-token', async (req, res, next) => {
  try {
    const shortToken = String(req.body?.shortToken || '').trim();
    if (!/^[A-Za-z0-9_-]{20,1000}$/.test(shortToken)) {
      throw httpError(400, '短效 User Access Token 格式不正確。');
    }
    const result = await exchangeUserToken(shortToken);
    res.json(result);
  } catch (error) { next(error); }
});
