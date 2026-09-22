import { Router } from 'express';
import { activeCampaigns, activeAdSets, buildIndividualReport } from '../services/ads.js';
import { assertAccountAllowed } from '../services/access.js';
import { requireMetaAccountId, requireMetaObjectId } from '../validate.js';
import { httpError } from '../errors.js';

export const adsRouter = Router();

adsRouter.get('/accounts/:accountId/campaigns', async (req, res, next) => {
  try {
    const accountId = requireMetaAccountId(req.params.accountId);
    await assertAccountAllowed(req.user, accountId);
    res.json({ campaigns: await activeCampaigns(accountId) });
  } catch (error) { next(error); }
});

adsRouter.get('/campaigns/:campaignId/adsets', async (req, res, next) => {
  try {
    // 需要 accountId 才能判斷這個廣告屬於誰，否則任何登入者都能用 ID 讀到別人的廣告組合。
    const accountId = requireMetaAccountId(req.query.accountId);
    const campaignId = requireMetaObjectId(req.params.campaignId, 'campaignId');
    await assertAccountAllowed(req.user, accountId);

    const campaigns = await activeCampaigns(accountId);
    if (!campaigns.some(x => x.id === campaignId)) {
      throw httpError(404, '找不到指定的進行中廣告。');
    }

    res.json({ adSets: await activeAdSets(campaignId) });
  } catch (error) { next(error); }
});

adsRouter.post('/reports/individual', async (req, res, next) => {
  try {
    const accountId = requireMetaAccountId(req.body?.accountId);
    await assertAccountAllowed(req.user, accountId);
    res.json(await buildIndividualReport(req.body || {}));
  } catch (error) { next(error); }
});
