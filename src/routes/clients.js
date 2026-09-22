import { Router } from 'express';
import { listClients } from '../services/clients.js';
import { activeCampaigns } from '../services/ads.js';

export const clientsRouter = Router();

const CONCURRENCY = 4;

// 限制同時打 Graph API 的數量，避免客戶數變多時觸發 Meta 限流。
async function mapWithLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

clientsRouter.get('/clients', async (_req, res, next) => {
  try {
    const clients = await listClients();

    const enriched = await mapWithLimit(clients, CONCURRENCY, async client => {
      try {
        const campaigns = await activeCampaigns(client.accountId);
        const message = campaigns.filter(x => x.type === 'message').length;
        const traffic = campaigns.filter(x => x.type === 'traffic').length;
        return { ...client, campaignCounts: { message, traffic, total: message + traffic } };
      } catch (error) {
        // 單一帳號讀取失敗不應讓整份客戶清單失敗。
        console.error('[clients] campaign count failed', client.accountId, error.message);
        return { ...client, campaignCounts: null, campaignCountsError: true };
      }
    });

    res.json({ clients: enriched });
  } catch (error) { next(error); }
});
