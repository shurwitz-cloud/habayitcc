/**
 * Generate HaBayit Hebrew fair access codes for accepted/active Adventure kids.
 * Does NOT send emails — prints codes to stdout for admin use.
 *
 * Usage: node scripts/generate-hebrew-fair-codes.mjs [.env.local]
 * Requires: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

function getEnvValue(path, name) {
  try {
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
  } catch {
    // missing file
  }
  return undefined;
}

const CODE_PREFIX = 'HA-';
const CODE_LENGTH = 6;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const HEBREW_ADVENTURE_SLUG = 'hebrew-adventure';

function generateCode() {
  let suffix = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    suffix += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  }
  return `${CODE_PREFIX}${suffix}`;
}

const envPath = process.argv[2] || '.env.local';
const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  getEnvValue(envPath, 'NEXT_PUBLIC_SUPABASE_URL')?.trim();
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  getEnvValue(envPath, 'SUPABASE_SERVICE_ROLE_KEY')?.trim();

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in', envPath);
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: program } = await supabase
  .from('programs')
  .select('id')
  .eq('slug', HEBREW_ADVENTURE_SLUG)
  .maybeSingle();

if (!program?.id) {
  console.error('Hebrew Adventure program not found in database.');
  process.exit(1);
}

const { data: regs, error } = await supabase
  .from('program_registrations')
  .select('id, fair_access_code, status, children(first_name, last_name)')
  .eq('program_id', program.id)
  .in('status', ['accepted', 'active']);

if (error) {
  console.error('Query failed:', error.message);
  process.exit(1);
}

let created = 0;
let existing = 0;

for (const reg of regs ?? []) {
  const rawChild = reg.children;
  const child = Array.isArray(rawChild) ? rawChild[0] : rawChild;
  const name = child ? `${child.first_name} ${child.last_name}`.trim() : 'Unknown';

  if (reg.fair_access_code) {
    existing++;
    console.log(`${name}\t${reg.fair_access_code}\t(existing)\t${reg.status}`);
    continue;
  }

  let assigned = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCode();
    const { data, error: updErr } = await supabase
      .from('program_registrations')
      .update({ fair_access_code: code })
      .eq('id', reg.id)
      .is('fair_access_code', null)
      .select('fair_access_code')
      .maybeSingle();

    if (!updErr && data?.fair_access_code) {
      assigned = data.fair_access_code;
      created++;
      break;
    }

    const { data: again } = await supabase
      .from('program_registrations')
      .select('fair_access_code')
      .eq('id', reg.id)
      .maybeSingle();
    if (again?.fair_access_code) {
      assigned = again.fair_access_code;
      existing++;
      break;
    }
  }

  if (assigned) {
    console.log(`${name}\t${assigned}\t(new)\t${reg.status}`);
  } else {
    console.error(`Failed to assign code for ${name} (${reg.id})`);
  }
}

console.log(
  `\nDone. ${created} new code(s), ${existing} already had codes, ${(regs ?? []).length} accepted/active registration(s).`,
);
