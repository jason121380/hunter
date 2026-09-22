import { Router } from 'express';
import { listClients } from '../services/clients.js';
import { campaignCounts } from '../services/ads.js';

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

// 只查資料庫，不碰 Meta，首頁清單可以立刻顯示。
clientsRouter.get('/clients', async (req, res, next) => {
  try {
    res.json({ clients: await listClients(req.user) });
  } catch (error) { next(error); }
});

// 首頁的「進行中廣告數」另外抓，畫面先出清單、數字晚一點補上。
// 權限：只計算 listClients(req.user) 回傳的客戶，STAFF 拿不到未指派帳號的數字。
clientsRouter.get('/clients/campaign-counts', async (req, res, next) => {
  try {
    const force = req.query.refresh === '1';
    const clients = await listClients(req.user);
    const started = Date.now();

    const results = await mapWithLimit(clients, CONCURRENCY, async client => {
      try {
        return { client, ...(await campaignCounts(client.accountId, { force })) };
      } catch (error) {
        // 單一帳號讀取失敗不應讓整份清單失敗。
        console.error('[counts] failed', client.accountId, error.message);
        return { client, counts: null, source: 'error', ms: 0 };
      }
    });

    // 計時紀錄：用來評估是否值得改成 Meta 批次 API（見 MEMORY.md）
    const tally = { fresh: 0, cache: 0, stale: 0, error: 0 };
    let slowest = { ms: 0, accountId: '' };
    for (const r of results) {
      tally[r.source] += 1;
      if (r.ms > slowest.ms) slowest = { ms: r.ms, accountId: r.client.accountId };
    }
    console.log(
      `[counts] user=${req.user.uid} accounts=${clients.length} force=${force}`
      + ` fresh=${tally.fresh} cache=${tally.cache} stale=${tally.stale} error=${tally.error}`
      + ` total=${Date.now() - started}ms slowest=${slowest.ms}ms${slowest.accountId ? ` (${slowest.accountId})` : ''}`
    );

    const counts = {};
    let oldest = null;
    for (const r of results) {
      counts[r.client.id] = r.counts;
      if (r.fetchedAt && (!oldest || r.fetchedAt < oldest)) oldest = r.fetchedAt;
    }

    res.json({ counts, updatedAt: oldest ? new Date(oldest).toISOString() : null });
  } catch (error) { next(error); }
});
