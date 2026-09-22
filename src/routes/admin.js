import { Router } from 'express';
import { importMetaAccounts } from '../services/admin.js';
import { bootstrapMetaAccounts } from '../services/bootstrap.js';

export const adminRouter = Router();

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
