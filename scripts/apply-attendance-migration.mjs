/**
 * Apply class attendance migration (0019).
 *
 *   node scripts/apply-attendance-migration.mjs
 *
 * Requires: npx supabase login (or SUPABASE_ACCESS_TOKEN)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'vrhgcxlpaocmmdnibehe';
const MIGRATION_FILE = '0019_class_attendance.sql';

function readCliToken() {
  const candidates = [
    path.join(process.env.APPDATA || '', 'supabase', 'access-token'),
    path.join(process.env.HOME || process.env.USERPROFILE || '', '.supabase', 'access-token'),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) {
      const token = fs.readFileSync(p, 'utf8').trim();
      if (token) return token;
    }
  }
  return undefined;
}

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim() || readCliToken();
if (!token) {
  console.error('Missing SUPABASE_ACCESS_TOKEN. Run: npx supabase login');
  console.error('Or paste supabase/migrations/0019_class_attendance.sql in the Supabase SQL Editor.');
  process.exit(1);
}

const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', MIGRATION_FILE);
const sql = fs.readFileSync(sqlPath, 'utf8');
console.log(`Applying ${MIGRATION_FILE}...`);

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
});

const body = await res.text();
if (!res.ok) {
  console.error(`FAILED (${res.status}):`, body.slice(0, 800));
  process.exit(1);
}

console.log('OK — attendance tables are ready.');
console.log(body.slice(0, 200));
