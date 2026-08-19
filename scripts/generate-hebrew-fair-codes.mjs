/**
 * Generate HaBayit Hebrew fair access codes for enrolled children.
 * Does NOT send emails — prints codes to stdout for admin use.
 *
 * Usage: node scripts/generate-hebrew-fair-codes.mjs
 * Requires: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL in .env.local
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

config({ path: '.env.local' });

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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(url, key);

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
  .in('status', ['pending', 'accepted', 'active']);

if (error) {
  console.error('Query failed:', error.message);
  process.exit(1);
}

let created = 0;

for (const reg of regs ?? []) {
  const rawChild = reg.children;
  const child = Array.isArray(rawChild) ? rawChild[0] : rawChild;
  const name = child ? `${child.first_name} ${child.last_name}`.trim() : 'Unknown';

  if (reg.fair_access_code) {
    console.log(`${name}\t${reg.fair_access_code}\t(existing)`);
    continue;
  }

  let assigned = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCode();
    const { error: updErr } = await supabase
      .from('program_registrations')
      .update({ fair_access_code: code })
      .eq('id', reg.id)
      .is('fair_access_code', null);

    if (!updErr) {
      assigned = code;
      created++;
      break;
    }
  }

  if (assigned) {
    console.log(`${name}\t${assigned}\t(new)`);
  } else {
    console.error(`Failed to assign code for ${name}`);
  }
}

console.log(`\nDone. ${created} new code(s), ${(regs ?? []).length} total registration(s).`);
