import { Router } from 'express';
import { activeCampaigns, activeAdSets, buildIndividualReport } from '../services/ads.js';

export const adsRouter = Router();

adsRouter.get('/accounts/:accountId/campaigns', async (req, res, next) => {
  try { res.json({ campaigns: await activeCampaigns(req.params.accountId) }); }
  catch (error) { next(error); }
});

adsRouter.get('/campaigns/:campaignId/adsets', async (req, res, next) => {
  try { res.json({ adSets: await activeAdSets(req.params.campaignId) }); }
  catch (error) { next(error); }
});

adsRouter.post('/reports/individual', async (req, res, next) => {
  try { res.json(await buildIndividualReport(req.body || {})); }
  catch (error) { next(error); }
});
