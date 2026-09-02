/**
 * Apply Hebrew fair access code schema (0012 column + 0013 redemptions).
 *
 *   node scripts/apply-hebrew-fair-codes-migration.mjs
 *
 * Requires: npx supabase login (or SUPABASE_ACCESS_TOKEN)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'vrhgcxlpaocmmdnibehe';

const MIGRATION_FILES = [
  '0012_paid_event_registrations.sql',
  '0013_hebrew_fair_code_redemptions.sql',
];

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
  process.exit(1);
}

for (const file of MIGRATION_FILES) {
  const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', file);
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log(`Applying ${file}...`);

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
    console.error(`FAILED ${file} (${res.status}):`, body.slice(0, 800));
    process.exit(1);
  }
  console.log(`OK ${file}`);
  if (body && body !== '[]') console.log(body.slice(0, 400));
}

console.log('Done. Hebrew fair_access_code column + redemptions table ready.');
