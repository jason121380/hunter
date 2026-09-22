import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { getTokenStatus } from './services/meta.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'hunter-ads-report-system' }));

app.get('/api/system/meta-token', async (_req, res, next) => {
  try { res.json(await getTokenStatus()); } catch (error) { next(error); }
});

app.use('/api', (_req, res) => {
  res.status(501).json({
    error: 'migration_in_progress',
    message: 'Railway V1 API 正在遷移；正式切換前舊 Apps Script 仍維持運作。',
  });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'internal_error', message: error.message || '伺服器錯誤' });
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`Hunter ads report system listening on :${config.port}`);
});
