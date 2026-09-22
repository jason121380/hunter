import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { migrate } from './migrate.js';
import { runStartupChecks } from './startup-check.js';
import { bootstrapMetaAccounts } from './services/bootstrap.js';
import { getTokenStatus } from './services/meta.js';
import { getSystemStatus } from './services/system.js';
import { adsRouter } from './routes/ads.js';
import { clientsRouter } from './routes/clients.js';
import { reportsRouter } from './routes/reports.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { requireLogin, validateAuthConfig } from './services/auth.js';
import { securityHeaders, requireSameOrigin } from './middleware/security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

const startupState = { databaseReady: false, databaseError: '' };

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(securityHeaders);
app.use(express.json({ limit: '256kb' }));
app.use(requireSameOrigin);

app.get('/health', (_req, res) =>
  res.json({ ok: true, service: 'hunter-ads-report-system', ready: startupState.databaseReady })
);

app.get(['/login', '/login.html'], (_req, res) => {
  res.sendFile(path.join(publicDir, 'login.html'));
});

app.get('/login.js', (_req, res) => {
  res.type('application/javascript').sendFile(path.join(publicDir, 'login.js'));
});

app.use('/api/auth', authRouter);

app.use(requireLogin);
app.use(express.static(publicDir));

app.get('/api/system/meta-token', async (_req, res, next) => {
  try { res.json(await getTokenStatus()); } catch (error) { next(error); }
});

app.get('/api/system/status', async (_req, res, next) => {
  try { res.json(await getSystemStatus()); } catch (error) { next(error); }
});

app.use('/api', clientsRouter);
app.use('/api', adsRouter);
app.use('/api', reportsRouter);
app.use('/api', adminRouter);

app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found', message: '找不到 API endpoint。' }));

app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((error, _req, res, _next) => {
  const status = Number(error.status) || 500;
  if (status >= 500) console.error(error);

  // 只有明確標記為可對外顯示的錯誤才回傳原訊息，避免洩漏資料庫或內部細節。
  const message = error.expose && error.message ? error.message : '伺服器錯誤，請稍後再試。';
  const code = status === 503 ? 'service_unavailable' : status >= 500 ? 'internal_error' : 'request_error';
  res.status(status).json({ error: code, message });
});

for (const issue of validateAuthConfig()) {
  console.warn('[config]', issue);
}

try {
  const adminState = await migrate();
  startupState.databaseReady = true;
  console.log('[migrate]', JSON.stringify(adminState));
} catch (error) {
  startupState.databaseError = error.message;
  console.error('[migrate] 資料庫初始化失敗，需要登入的功能將無法使用：', error.message);
}

await runStartupChecks();

if (config.bootstrapMetaOnStart) {
  try {
    const bootstrapResult = await bootstrapMetaAccounts();
    console.log('[bootstrap-meta]', JSON.stringify(bootstrapResult));
  } catch (error) {
    console.error('[bootstrap-meta] skipped:', error.message);
  }
} else {
  console.log('[bootstrap-meta] 已停用（設定 BOOTSTRAP_META_ON_START=true 或呼叫 /api/admin/bootstrap-meta 以手動執行）。');
}

app.listen(config.port, '0.0.0.0', () => {
  console.log(`Hunter ads report system listening on :${config.port}`);
});
