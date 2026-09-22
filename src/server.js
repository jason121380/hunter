import express from 'express';
import { config } from './config.js';
import { migrate } from './migrate.js';
import { getTokenStatus } from './services/meta.js';
import { adsRouter } from './routes/ads.js';
import { clientsRouter } from './routes/clients.js';
import { reportsRouter } from './routes/reports.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'hunter-ads-report-system' }));

app.get('/api/system/meta-token', async (_req, res, next) => {
  try { res.json(await getTokenStatus()); } catch (error) { next(error); }
});

app.use('/api', clientsRouter);
app.use('/api', adsRouter);
app.use('/api', reportsRouter);

app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found', message: '找不到 API endpoint。' }));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'internal_error', message: error.message || '伺服器錯誤' });
});

await migrate();

app.listen(config.port, '0.0.0.0', () => {
  console.log(`Hunter ads report system listening on :${config.port}`);
});
