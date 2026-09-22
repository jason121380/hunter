import { Router } from 'express';
import { listClients } from '../services/clients.js';
import { activeCampaigns } from '../services/ads.js';

export const clientsRouter = Router();

clientsRouter.get('/clients', async (_req, res, next) => {
  try {
    const clients = await listClients();
    const enriched = await Promise.all(clients.map(async client => {
      const campaigns = await activeCampaigns(client.accountId);
      const message = campaigns.filter(x => x.type === 'message').length;
      const traffic = campaigns.filter(x => x.type === 'traffic').length;
      return { ...client, campaignCounts: { message, traffic, total: message + traffic } };
    }));
    res.json({ clients: enriched });
  } catch (error) { next(error); }
});
