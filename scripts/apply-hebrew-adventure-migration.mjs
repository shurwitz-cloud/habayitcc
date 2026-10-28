/**
 * Applies Hebrew Adventure program rename in Supabase (migrations 0002 + 0003).
 * Usage: node scripts/apply-hebrew-adventure-migration.mjs [.env.vercel.production]
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function getEnvValue(path, name) {
  const content = readFileSync(path, 'utf8');
  const match = content.match(new RegExp(`^${name}=(.*)$`, 'm'));
  if (!match) return undefined;
  let value = match[1].trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

const envPath = process.argv[2] || '.env.vercel.production';

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

const { data: before, error: readError } = await supabase
  .from('programs')
  .select('id, slug, name')
  .in('slug', ['hebrew-school', 'hebrew-adventure']);

if (readError) {
  console.error('Read failed:', readError.message);
  process.exit(1);
}

console.log('Before:', before);

const { data: updated, error: updateError } = await supabase
  .from('programs')
  .update({
    slug: 'hebrew-adventure',
    name: 'HaBayit Hebrew Adventure',
  })
  .eq('slug', 'hebrew-school')
  .select('id, slug, name');

if (updateError) {
  console.error('Update failed:', updateError.message);
  process.exit(1);
}

console.log('Updated rows:', updated?.length ?? 0, updated);
console.log('Done.');
