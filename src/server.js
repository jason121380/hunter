import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { migrate } from './migrate.js';
import { getTokenStatus } from './services/meta.js';
import { adsRouter } from './routes/ads.js';
import { clientsRouter } from './routes/clients.js';
import { reportsRouter } from './routes/reports.js';
import { adminRouter } from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'hunter-ads-report-system' }));

app.get('/api/system/meta-token', async (_req, res, next) => {
  try { res.json(await getTokenStatus()); } catch (error) { next(error); }
});

app.use('/api', clientsRouter);
app.use('/api', adsRouter);
app.use('/api', reportsRouter);
app.use('/api', adminRouter);

app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found', message: '找不到 API endpoint。' }));

app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'internal_error', message: error.message || '伺服器錯誤' });
});

await migrate();

app.listen(config.port, '0.0.0.0', () => {
  console.log(`Hunter ads report system listening on :${config.port}`);
});
