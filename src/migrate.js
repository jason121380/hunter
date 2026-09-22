import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from './db.js';
import { ensureDefaultAdmin } from './services/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function migrate() {
  const schemaPath = path.join(__dirname, '..', 'migrations', '001_init.sql');
  const schema = await fs.readFile(schemaPath, 'utf8');

  await query(schema);
  return ensureDefaultAdmin();
}
