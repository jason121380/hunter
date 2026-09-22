import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

export const pool = config.databaseUrl
  ? new Pool({
      connectionString: config.databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    })
  : null;

export async function query(text, params = []) {
  if (!pool) throw new Error('DATABASE_URL 尚未設定。');
  return pool.query(text, params);
}
