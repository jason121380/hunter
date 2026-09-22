import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from './db.js';
import { ensureDefaultAdmin } from './services/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'migrations');

export async function migrate() {
  const files = (await fs.readdir(migrationsDir))
    .filter(name => name.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    await query(sql);
  }

  return { migrations: files.length, admin: await ensureDefaultAdmin() };
}
