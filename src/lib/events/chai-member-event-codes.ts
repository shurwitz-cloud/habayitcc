import { createAdminClient } from '@/lib/supabase/server';

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

export async function recordMemberCodeRedemption(input: {
  eventId: string;
  eventRegistrationId?: string | null;
  partnerId: string;
  code: string;
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
