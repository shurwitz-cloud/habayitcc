/**
 * Generate the 10 one-time staff codes for the Teens BBQ Kickoff and
 * insert them into bbq_staff_codes (migration 0031 must be applied
 * first). Prints the codes to stdout ONCE for private delivery to the
 * office - they are never written to the repo.
 *
 * Usage: node scripts/generate-bbq-staff-codes.mjs [.env.local]
 * Requires: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const CODE_COUNT = 10;
const CODE_PREFIX = 'BBQ-';
const CODE_LENGTH = 8;
// No look-alike characters (0/O, 1/I/L) so codes are easy to read aloud.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const EVENT_SLUG = 'teens-bbq';

function getEnvValue(path, name) {
  try {
    const content = readFileSync(path, 'utf8').replace(/^﻿/, '');
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

const envPath = process.argv[2] || '.env.local';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || getEnvValue(envPath, 'NEXT_PUBLIC_SUPABASE_URL');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || getEnvValue(envPath, 'SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

function generateCode() {
  let suffix = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    suffix += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  }
  return `${CODE_PREFIX}${suffix}`;
}

const codes = new Set();
while (codes.size < CODE_COUNT) codes.add(generateCode());

const rows = [...codes].map((code) => ({ code, event_slug: EVENT_SLUG }));
const { error } = await supabase.from('bbq_staff_codes').insert(rows);
if (error) {
  console.error('Insert failed:', error.message);
  process.exit(1);
}

console.log('Teens BBQ staff codes (one admission each, one-time use):');
for (const code of codes) console.log(code);
