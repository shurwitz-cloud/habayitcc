import { createAdminClient } from '@/lib/supabase/server';
import { HEBREW_ADVENTURE_SLUG } from '@/lib/programs/names';
import crypto from 'crypto';

const CODE_PREFIX = 'HA-';
const CODE_LENGTH = 6;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeFairCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function generateFairAccessCode(): string {
  let suffix = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    const idx = crypto.randomInt(0, CODE_ALPHABET.length);
    suffix += CODE_ALPHABET[idx];
  }
  return `${CODE_PREFIX}${suffix}`;
}

export interface FairCodeLookup {
  valid: boolean;
  childFirstName?: string;
  childLastName?: string;
  registrationId?: string;
}

/** Verify a HaBayit Hebrew Adventure fair access code (server-only). */
export async function verifyHebrewFairCode(codeRaw: string): Promise<FairCodeLookup> {
  const code = normalizeFairCode(codeRaw);
  if (!code.startsWith(CODE_PREFIX) || code.length < CODE_PREFIX.length + 4) {
    return { valid: false };
  }

  const supabase = createAdminClient();

  const { data: program } = await supabase
    .from('programs')
    .select('id')
    .eq('slug', HEBREW_ADVENTURE_SLUG)
    .maybeSingle();

  if (!program?.id) return { valid: false };

  const { data: reg } = await supabase
    .from('program_registrations')
    .select('id, status, fair_access_code, children(first_name, last_name)')
    .eq('program_id', program.id)
    .eq('fair_access_code', code)
    .maybeSingle();

  if (!reg?.fair_access_code) return { valid: false };

  const activeStatuses = new Set(['pending', 'accepted', 'active']);
  if (!activeStatuses.has(reg.status)) return { valid: false };

  const rawChild = reg.children as
    | { first_name: string; last_name: string }
    | { first_name: string; last_name: string }[]
    | null;
  const child = Array.isArray(rawChild) ? rawChild[0] : rawChild;

  return {
    valid: true,
    registrationId: reg.id,
    childFirstName: child?.first_name,
    childLastName: child?.last_name,
  };
}

/** Assign codes to Hebrew Adventure registrations missing one. Returns count created. */
export async function ensureHebrewFairCodesForAll(): Promise<{
  created: number;
  total: number;
  codes: Array<{ registrationId: string; childName: string; code: string }>;
}> {
  const supabase = createAdminClient();

  const { data: program } = await supabase
    .from('programs')
    .select('id')
    .eq('slug', HEBREW_ADVENTURE_SLUG)
    .maybeSingle();

  if (!program?.id) {
    return { created: 0, total: 0, codes: [] };
  }

  const { data: regs } = await supabase
    .from('program_registrations')
    .select('id, fair_access_code, status, children(first_name, last_name)')
    .eq('program_id', program.id)
    .in('status', ['pending', 'accepted', 'active']);

  const rows = regs ?? [];
  const codes: Array<{ registrationId: string; childName: string; code: string }> = [];
  let created = 0;

  for (const reg of rows) {
    const rawChild = reg.children as
      | { first_name: string; last_name: string }
      | { first_name: string; last_name: string }[]
      | null;
    const child = Array.isArray(rawChild) ? rawChild[0] : rawChild;
    const childName = child
      ? `${child.first_name} ${child.last_name}`.trim()
      : 'Unknown';

    const existingCode =
      typeof reg.fair_access_code === 'string' ? reg.fair_access_code : null;

    if (existingCode) {
      codes.push({
        registrationId: reg.id,
        childName,
        code: existingCode,
      });
      continue;
    }

    let assigned = '';
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = generateFairAccessCode();
      const { error } = await supabase
        .from('program_registrations')
        .update({ fair_access_code: candidate })
        .eq('id', reg.id)
        .is('fair_access_code', null);

      if (!error) {
        assigned = candidate;
        created++;
        break;
      }
    }

    if (assigned) {
      codes.push({ registrationId: reg.id, childName, code: assigned });
    }
  }

  return { created, total: rows.length, codes };
}
