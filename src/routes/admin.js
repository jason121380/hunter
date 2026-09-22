import { Router } from 'express';
import { importMetaAccounts } from '../services/admin.js';
import { bootstrapMetaAccounts } from '../services/bootstrap.js';
import { metaGetAll, exchangeUserToken } from '../services/meta.js';
import {
  listUsers,
  listAssignableClients,
  createUser,
  updateUser,
  setUserPassword,
  deleteUser,
} from '../services/users.js';
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
    res.json(await exchangeUserToken(shortToken));
  } catch (error) { next(error); }
});

adminRouter.get('/admin/users', async (_req, res, next) => {
  try {
    const [users, clients] = await Promise.all([listUsers(), listAssignableClients()]);
    res.json({ users, clients });
  } catch (error) { next(error); }
});

adminRouter.post('/admin/users', async (req, res, next) => {
  try { res.status(201).json({ ok: true, user: await createUser(req.body || {}) }); }
  catch (error) { next(error); }
});

adminRouter.patch('/admin/users/:userId', async (req, res, next) => {
  try {
    const user = await updateUser(req.user.uid, req.params.userId, req.body || {});
    res.json({ ok: true, user });
  } catch (error) { next(error); }
});

adminRouter.post('/admin/users/:userId/password', async (req, res, next) => {
  try { res.json(await setUserPassword(req.params.userId, req.body?.password)); }
  catch (error) { next(error); }
});

adminRouter.delete('/admin/users/:userId', async (req, res, next) => {
  try { res.json(await deleteUser(req.user.uid, req.params.userId)); }
  catch (error) { next(error); }
});
