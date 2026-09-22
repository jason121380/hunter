import pg from 'pg';
import { config } from './config.js';
import { httpError } from './errors.js';

const { Pool } = pg;

// Railway 私有網路（*.railway.internal）不需要 TLS；
// 對外連線一律驗證憑證，除非明確設定 DATABASE_SSL_INSECURE=true。
function sslOptions(connectionString) {
  let host = '';
  try {
    host = new URL(connectionString).hostname;
  } catch {
    return undefined;
  }

  const isPrivate =
    host.endsWith('.railway.internal') ||
    host === 'localhost' ||
    host === '127.0.0.1';

  if (isPrivate) return undefined;

  if (String(process.env.DATABASE_SSL_INSECURE || '').toLowerCase() === 'true') {
    console.warn('[db] DATABASE_SSL_INSECURE=true：已停用資料庫 TLS 憑證驗證。');
    return { rejectUnauthorized: false };
  }

  return { rejectUnauthorized: true };
}

export const pool = config.databaseUrl
  ? new Pool({
      connectionString: config.databaseUrl,
      ssl: sslOptions(config.databaseUrl),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      statement_timeout: 30_000,
    })
  : null;

// 沒有這個 handler，閒置連線被伺服器切斷時會讓整個程序崩潰。
pool?.on('error', error => {
  console.error('[db] idle client error:', error.message);
});

export async function query(text, params = []) {
  if (!pool) {
    // 對外只給一般性訊息，詳細設定狀態留在伺服器 log。
    console.error('[db] DATABASE_URL 尚未設定，查詢已中止。');
    throw httpError(503, '服務尚未就緒，請稍後再試。');
  }
  return pool.query(text, params);
}
