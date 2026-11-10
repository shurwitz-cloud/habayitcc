import { createAdminClient } from '@/lib/supabase/server';
import { skateAllowanceConsumed } from '@/lib/events/skate-allowance';

export function normalizeMemberCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

export interface MemberCodeLookup {
  valid: boolean;
  reason?: 'invalid' | 'not_eligible' | 'already_used';
  partnerId?: string;
  code?: string;
}

function asDetails(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export async function isMemberCodeUsedForEvent(
  codeRaw: string,
  eventSlug: string,
): Promise<boolean> {
  const code = normalizeMemberCode(codeRaw);
  if (!code) return false;

  const supabase = createAdminClient();

  const { data: event } = await supabase
    .from('events')
    .select('id')
    .eq('slug', eventSlug)
    .maybeSingle();

  if (event?.id) {
    const { data: redemption, error } = await supabase
      .from('chai_event_code_redemptions')
      .select('id')
      .eq('event_id', event.id)
      .eq('access_code', code)
      .maybeSingle();
    if (!error && redemption?.id) return true;
  }

  const { data: rows } = await supabase
    .from('event_registrations')
    .select('id, registration_details')
    .eq('event_slug', eventSlug);

  for (const row of rows ?? []) {
    const details = asDetails(row.registration_details);
    const couples = asDetails(details?.couples);
    const stored = normalizeMemberCode(String(couples?.memberCode || ''));
    if (stored && stored === code) return true;
  }

  return false;
}

/** Verify a HaBayit member (Chai Partner) access code. */
export async function verifyHaBayitMemberCode(
  codeRaw: string,
  options?: { eventSlug?: string },
): Promise<MemberCodeLookup> {
  const code = normalizeMemberCode(codeRaw);
  if (code.length < 4) return { valid: false, reason: 'invalid' };

  const supabase = createAdminClient();
  const { data: partner, error } = await supabase
    .from('chai_partners')
    .select('id, status, access_code')
    .eq('access_code', code)
    .maybeSingle();

  if (error) {
    console.error('[member-code] lookup failed:', error.message);
  }
  if (!partner?.id) return { valid: false, reason: 'invalid' };
  if (partner.status !== 'active') {
    return { valid: false, reason: 'not_eligible', partnerId: partner.id, code };
  }

  if (options?.eventSlug) {
    const used = await isMemberCodeUsedForEvent(code, options.eventSlug);
    if (used) {
      return { valid: false, reason: 'already_used', partnerId: partner.id, code };
    }
  }

  return { valid: true, partnerId: partner.id, code };
}

/**
 * Max people one Chai member can discount per skate event, and the whole
 * discounted entitlement is one reservation: once any of it is used (held
 * or consumed), the member cannot discount another reservation for that
 * event.
 */
export const SKATE_MEMBER_PEOPLE_LIMIT = 6;

export interface SkateMemberLookup {
  valid: boolean;
  reason?: 'invalid' | 'not_eligible' | 'exhausted' | 'already_used' | 'identity_mismatch' | 'unverified';
  partnerId?: string;
  code?: string;
  /** Discounted people this member has left for this event (all or none). */
  remaining?: number;
}

function digitsOnly(v: string): string {
  return v.replace(/\D+/g, '');
}

function normText(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Discounted (member-priced) people already registered with this code for
 * this event, counted from event registrations (fallback source; the
 * reservation table is the source of truth once migration 0028 is live).
 * Counts member-priced skaters AND non-skater passes. Returns null if the
 * scan failed.
 */
export async function skateMemberPeopleUsed(
  codeRaw: string,
  eventSlug: string,
): Promise<number | null> {
  const code = normalizeMemberCode(codeRaw);
  if (!code) return 0;
  const supabase = createAdminClient();
  const { data: rows, error } = await supabase
    .from('event_registrations')
    .select('id, registration_details')
    .eq('event_slug', eventSlug);
  if (error) {
    console.error('[member-code] skate usage scan failed:', error.message);
    return null;
  }
  let used = 0;
  for (const row of rows ?? []) {
    const details = asDetails(row.registration_details);
    if (details?.type !== 'skate') continue;
    const skate = asDetails(details.skate);
    const stored = normalizeMemberCode(String(skate?.memberCode || ''));
    if (!stored || stored !== code) continue;
    const lines = Array.isArray(details.skateLines) ? details.skateLines : null;
    const passLines = Array.isArray(details.skatePassLines) ? details.skatePassLines : null;
    if (lines || passLines) {
      used += (lines ?? []).filter((l) => asDetails(l)?.member === true).length;
      used += (passLines ?? []).filter((l) => asDetails(l)?.member === true).length;
    } else if (skate?.memberDiscount === true) {
      used +=
        Math.max(0, Math.round(Number(skate.skaters) || 0)) +
        Math.max(0, Math.round(Number(skate.nonSkaters) || 0));
    }
  }
  return used;
}

/**
 * Verify a Chai member code for a SKATE event (Fire on Ice rules):
 * 15% off up to SKATE_MEMBER_PEOPLE_LIMIT people on ONE reservation per
 * member per event - any earlier use (a paid registration or an in-flight
 * checkout hold) means the code is already used for this event. The code
 * must match the registrant (or their spouse) by email, phone, full name,
 * or surname. Couples events keep single-use rules.
 */
export async function verifySkateMemberCode(
  codeRaw: string,
  options: {
    eventSlug: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  },
): Promise<SkateMemberLookup> {
  const code = normalizeMemberCode(codeRaw);
  if (code.length < 4) return { valid: false, reason: 'invalid' };

  const supabase = createAdminClient();
  const { data: partner, error } = await supabase
    .from('chai_partners')
    .select('id, status, access_code, first_name, last_name, email, phone, family_id')
    .eq('access_code', code)
    .maybeSingle();

  if (error) {
    console.error('[member-code] skate lookup failed:', error.message);
  }
  if (!partner?.id) return { valid: false, reason: 'invalid' };
  if (partner.status !== 'active') {
    return { valid: false, reason: 'not_eligible', partnerId: partner.id, code };
  }

  // Identity: registrant must match the member or a spouse/parent in the
  // member's family by email, phone, full name, or surname.
  const candidates: Array<{ first?: string; last?: string; email?: string; phone?: string }> = [
    {
      first: String(partner.first_name || ''),
      last: String(partner.last_name || ''),
      email: String(partner.email || ''),
      phone: String(partner.phone || ''),
    },
  ];
  if (partner.family_id) {
    const { data: parents } = await supabase
      .from('parents')
      .select('first_name, last_name, email, phone')
      .eq('family_id', partner.family_id);
    for (const p of parents ?? []) {
      candidates.push({
        first: String(p.first_name || ''),
        last: String(p.last_name || ''),
        email: String(p.email || ''),
        phone: String(p.phone || ''),
      });
    }
  }

  const rFirst = normText(options.firstName || '');
  const rLast = normText(options.lastName || '');
  const rEmail = normText(options.email || '');
  const rPhone = digitsOnly(options.phone || '');
  const matched = candidates.some((c) => {
    const cFirst = normText(c.first || '');
    const cLast = normText(c.last || '');
    const cEmail = normText(c.email || '');
    const cPhone = digitsOnly(c.phone || '');
    if (rEmail && cEmail && rEmail === cEmail) return true;
    // Compare on the last 10 digits so +1 country code formatting matches.
    if (rPhone && cPhone && rPhone.slice(-10) === cPhone.slice(-10)) return true;
    if (rFirst && rLast && cFirst && cLast && rFirst === cFirst && rLast === cLast) return true;
    if (rLast && cLast && rLast === cLast) return true; // surname qualifies per event owner
    return false;
  });
  if (!matched) {
    return { valid: false, reason: 'identity_mismatch', partnerId: partner.id, code };
  }

  // One discounted reservation per member per event: "already used"
  // means a COMPLETED PAID registration only (consumed slots in the
  // reservation table once migration 0028 is applied, or a member-priced
  // registration before that). An unfinished or failed checkout
  // (reserved slots) never counts as used - the payment-intent route
  // reconciles the member's own holds against Stripe and releases the
  // unpaid ones before claiming. A real error in both sources means
  // unverified.
  let used: number | null = null;
  const { data: eventRow } = await supabase
    .from('events')
    .select('id')
    .eq('slug', options.eventSlug)
    .maybeSingle();
  if (eventRow?.id) {
    used = await skateAllowanceConsumed({ eventId: eventRow.id, partnerId: partner.id });
  }
  if (used === null) {
    used = await skateMemberPeopleUsed(code, options.eventSlug);
  }
  if (used === null) {
    // Usage could not be verified: never grant the discount unverified.
    // Caller tells the registrant to retry or continue at full price.
    return { valid: false, reason: 'unverified', partnerId: partner.id, code };
  }
  if (used > 0) {
    return { valid: false, reason: 'already_used', partnerId: partner.id, code, remaining: 0 };
  }
  return { valid: true, partnerId: partner.id, code, remaining: SKATE_MEMBER_PEOPLE_LIMIT };
}

export async function recordMemberCodeRedemption(input: {
  eventId: string;
  eventRegistrationId?: string | null;
  partnerId: string;
  code: string;
  /** Skate events allow reuse up to the per-member skater limit. */
  allowReuse?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('chai_event_code_redemptions').insert({
    chai_partner_id: input.partnerId,
    event_id: input.eventId,
    event_registration_id: input.eventRegistrationId ?? null,
    access_code: normalizeMemberCode(input.code),
  });

  if (!error) return { ok: true };

  if (error.code === '23505') {
    if (input.allowReuse) return { ok: true }; // usage counted from registrations
    return { ok: false, error: 'This HaBayit member code was already used for this event.' };
  }
  if (/chai_event_code_redemptions|schema cache|does not exist/i.test(error.message)) {
    console.warn('[member-code] redemptions table missing — uniqueness via registrations only');
    return { ok: true };
  }

  console.error('[member-code] redemption insert error:', error);
  return { ok: false, error: 'Could not save member code usage. Please try again.' };
}

export async function attachMemberCodeRedemptionToEventRegistration(input: {
  eventId: string;
  eventRegistrationId: string;
  partnerId: string;
}): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('chai_event_code_redemptions')
    .update({ event_registration_id: input.eventRegistrationId })
    .eq('event_id', input.eventId)
    .eq('chai_partner_id', input.partnerId);
  if (error && !/chai_event_code_redemptions|schema cache|does not exist/i.test(error.message)) {
    console.error('[member-code] attach redemption failed:', error.message);
  }
}

export async function releaseMemberCodeRedemption(input: {
  eventId: string;
  partnerId: string;
}): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('chai_event_code_redemptions')
    .delete()
    .eq('event_id', input.eventId)
    .eq('chai_partner_id', input.partnerId)
    .is('event_registration_id', null);
  if (error && !/chai_event_code_redemptions|schema cache|does not exist/i.test(error.message)) {
    console.error('[member-code] release redemption failed:', error.message);
  }
}
