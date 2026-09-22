import express from 'express';
import { config } from './config.js';
import { migrate } from './migrate.js';
import { getTokenStatus } from './services/meta.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'hunter-ads-report-system' });
});

app.get('/api/system/meta-token', async (_req, res, next) => {
  try {
    res.json(await getTokenStatus());
  } catch (error) {
    next(error);
  }
});

app.use('/api', (_req, res) => {
  res.status(501).json({
    error: 'migration_in_progress',
    message: 'Railway V1 API 正在遷移；正式切換前舊 Apps Script 仍維持運作。',
  });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({
    error: 'internal_error',
    message: error.message || '伺服器錯誤',
  });
});

await migrate();

app.listen(config.port, '0.0.0.0', () => {
  console.log(`Hunter ads report system listening on :${config.port}`);
});
