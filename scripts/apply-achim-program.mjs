/**
 * Inserts HaBayit Achim program row (migration 0010).
 * Usage: node scripts/apply-achim-program.mjs [.env.local]
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function getEnvValue(path, name) {
  const content = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  for (const line of content.split(/\r?\n/)) {
    if (!line.startsWith(`${name}=`)) continue;
    let value = line.slice(name.length + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return undefined;
}

const envPath = process.argv[2] || '.env.local';

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  getEnvValue(envPath, 'NEXT_PUBLIC_SUPABASE_URL')?.trim();
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  getEnvValue(envPath, 'SUPABASE_SERVICE_ROLE_KEY')?.trim();

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase
  .from('programs')
  .upsert(
    {
      slug: 'achim',
      name: 'HaBayit Achim',
      description: '6th grade boys program — every Tuesday, September through May',
    },
    { onConflict: 'slug' }
  )
  .select('id, slug, name')
  .single();

if (error) {
  console.error(error);
  process.exit(1);
}

console.log('Achim program ready:', data);
