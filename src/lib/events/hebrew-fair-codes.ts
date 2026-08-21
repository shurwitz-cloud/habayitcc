import { createAdminClient } from '@/lib/supabase/server';
import { HEBREW_ADVENTURE_SLUG } from '@/lib/programs/names';
import crypto from 'crypto';

const CODE_PREFIX = 'HA-';
const CODE_LENGTH = 6;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Statuses that may hold a usable event free-entry code. */
const CODE_ELIGIBLE_STATUSES = ['accepted', 'active'] as const;

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
  reason?: 'invalid' | 'not_eligible' | 'already_used' | 'duplicate_in_request';
  childFirstName?: string;
  childLastName?: string;
  registrationId?: string;
  code?: string;
}

async function assignCodeToRegistration(
  supabase: ReturnType<typeof createAdminClient>,
  registrationId: string
): Promise<string | null> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = generateFairAccessCode();
    const { data, error } = await supabase
      .from('program_registrations')
      .update({ fair_access_code: candidate })
      .eq('id', registrationId)
      .is('fair_access_code', null)
      .select('fair_access_code')
      .maybeSingle();

    if (!error && data?.fair_access_code) {
      return data.fair_access_code;
    }

    // Another writer may have won — re-read.
    const { data: existing } = await supabase
      .from('program_registrations')
      .select('fair_access_code')
      .eq('id', registrationId)
      .maybeSingle();
    if (existing?.fair_access_code) {
      return existing.fair_access_code;
    }
  }
  return null;
}

/**
 * Ensure each registration has a unique HA- code (no-op if already set).
 * Intended for Hebrew Adventure accepted registrations.
 */
export async function ensureFairAccessCodesForRegistrationIds(
  registrationIds: string[]
): Promise<Array<{ registrationId: string; code: string }>> {
  if (!registrationIds.length) return [];

  const supabase = createAdminClient();
  const assigned: Array<{ registrationId: string; code: string }> = [];

  for (const id of registrationIds) {
    const { data: reg } = await supabase
      .from('program_registrations')
      .select('id, fair_access_code')
      .eq('id', id)
      .maybeSingle();

    if (!reg) continue;

    if (typeof reg.fair_access_code === 'string' && reg.fair_access_code) {
      assigned.push({ registrationId: reg.id, code: reg.fair_access_code });
      continue;
    }

    const code = await assignCodeToRegistration(supabase, reg.id);
    if (code) {
      assigned.push({ registrationId: reg.id, code });
    }
  }

  return assigned;
}

/** After accepting Hebrew Adventure kids — issue codes (no email). */
export async function issueFairAccessCodesAfterAccept(input: {
  programSlug: string;
  registrationIds: string[];
}): Promise<Array<{ registrationId: string; code: string }>> {
  if (input.programSlug !== HEBREW_ADVENTURE_SLUG) return [];
  return ensureFairAccessCodesForRegistrationIds(input.registrationIds);
}

/**
 * Verify a HaBayit Hebrew Adventure free-entry code.
 * When `eventSlug` is provided, rejects codes already redeemed for that event.
 */
export async function verifyHebrewFairCode(
  codeRaw: string,
  options?: { eventSlug?: string }
): Promise<FairCodeLookup> {
  const code = normalizeFairCode(codeRaw);
  if (!code.startsWith(CODE_PREFIX) || code.length < CODE_PREFIX.length + 4) {
    return { valid: false, reason: 'invalid' };
  }

  const supabase = createAdminClient();

  const { data: program } = await supabase
    .from('programs')
    .select('id')
    .eq('slug', HEBREW_ADVENTURE_SLUG)
    .maybeSingle();

  if (!program?.id) return { valid: false, reason: 'invalid' };

  const { data: reg } = await supabase
    .from('program_registrations')
    .select('id, status, fair_access_code, children(first_name, last_name)')
    .eq('program_id', program.id)
    .eq('fair_access_code', code)
    .maybeSingle();

  if (!reg?.fair_access_code) return { valid: false, reason: 'invalid' };

  if (!CODE_ELIGIBLE_STATUSES.includes(reg.status as (typeof CODE_ELIGIBLE_STATUSES)[number])) {
    return { valid: false, reason: 'not_eligible' };
  }

  if (options?.eventSlug) {
    const { data: event } = await supabase
      .from('events')
      .select('id')
      .eq('slug', options.eventSlug)
      .maybeSingle();

    if (event?.id) {
      const { data: redemption } = await supabase
        .from('hebrew_fair_code_redemptions')
        .select('id')
        .eq('program_registration_id', reg.id)
        .eq('event_id', event.id)
        .maybeSingle();

      if (redemption) {
        return {
          valid: false,
          reason: 'already_used',
          registrationId: reg.id,
          code,
        };
      }
    }
  }

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
    code,
  };
}

/** Record one-time redemptions for an event. Returns false if any code already used. */
export async function recordFairCodeRedemptions(input: {
  eventId: string;
  eventRegistrationId?: string | null;
  items: Array<{ registrationId: string; code: string }>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.items.length) return { ok: true };

  const supabase = createAdminClient();
  const rows = input.items.map((item) => ({
    program_registration_id: item.registrationId,
    event_id: input.eventId,
    event_registration_id: input.eventRegistrationId ?? null,
    fair_access_code: normalizeFairCode(item.code),
  }));

  const { error } = await supabase.from('hebrew_fair_code_redemptions').insert(rows);
  if (error) {
    if (error.code === '23505') {
      return {
        ok: false,
        error: 'One of the Hebrew codes was already used for this event.',
      };
    }
    console.error('[fair codes] redemption insert error:', error);
    return { ok: false, error: 'Could not save Hebrew code usage. Please try again.' };
  }

  return { ok: true };
}

export async function attachFairCodeRedemptionsToEventRegistration(input: {
  eventId: string;
  eventRegistrationId: string;
  registrationIds: string[];
}): Promise<void> {
  if (!input.registrationIds.length) return;
  const supabase = createAdminClient();
  await supabase
    .from('hebrew_fair_code_redemptions')
    .update({ event_registration_id: input.eventRegistrationId })
    .eq('event_id', input.eventId)
    .in('program_registration_id', input.registrationIds);
}

export async function releaseFairCodeRedemptions(input: {
  eventId: string;
  registrationIds: string[];
}): Promise<void> {
  if (!input.registrationIds.length) return;
  const supabase = createAdminClient();
  await supabase
    .from('hebrew_fair_code_redemptions')
    .delete()
    .eq('event_id', input.eventId)
    .in('program_registration_id', input.registrationIds)
    .is('event_registration_id', null);
}

/** Assign codes to accepted/active Hebrew Adventure registrations missing one. */
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
    .in('status', [...CODE_ELIGIBLE_STATUSES]);

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

    const assigned = await assignCodeToRegistration(supabase, reg.id);
    if (assigned) {
      created++;
      codes.push({ registrationId: reg.id, childName, code: assigned });
    }
  }

  return { created, total: rows.length, codes };
}
