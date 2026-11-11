import { createAdminClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/server';

/**
 * Race-safe one-time staff codes for the Teens BBQ event.
 *
 * Each code covers ONE admission exactly once. Codes live in the
 * bbq_staff_codes table (migration 0031) and are inserted privately
 * at go-live; no plaintext codes exist in the repo.
 *
 * DORMANT until migration 0031_bbq_staff_codes is applied: every
 * function detects the missing table/RPC and reports
 * supported:false so callers fail CLOSED (no code discount granted)
 * instead of falling back to a racy check-then-update.
 *
 * Flow: claim the code before the Stripe payment intent is created
 * (never charge for a discount that no longer exists) -> bind the
 * payment intent id -> consume when the registration persists
 * (submit path or webhook, idempotent) -> release on failure. A
 * free ($0) registration claims in the submit action and consumes
 * right after persist. Holds NEVER free by time alone. Only the cookie-owning
 * browser can resume the same cart or replace a still-unpaid cart; processing,
 * confirmation and unknown states stay pending. A canceled PI is terminal before
 * its guarded release. Paid holds remain proof for submit/webhook recovery.
 */

interface RpcError {
  code?: string;
  message?: string;
}

function isMissingSchema(error: RpcError | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01') return true;
  return /could not find|does not exist|relation .* does not exist/i.test(error.message || '');
}

export function normalizeStaffCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

export interface StaffCodeLookup {
  valid: boolean;
  /** false when migration 0031 is not applied - fail closed. */
  supported: boolean;
  reason?: 'invalid' | 'already_used' | 'in_progress';
  code?: string;
}

/** Verify a staff code for live form feedback (no claim). */
export async function verifyBbqStaffCode(codeRaw: string, ownedClaimToken?: string): Promise<StaffCodeLookup> {
  const code = normalizeStaffCode(codeRaw);
  if (code.length < 6) return { valid: false, supported: true, reason: 'invalid' };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('bbq_staff_codes')
    .select('code, status, claim_token')
    .eq('code', code)
    .maybeSingle();

  if (error) {
    if (isMissingSchema(error)) return { valid: false, supported: false };
    console.error('[bbq-staff-code] lookup failed:', error.message);
    return { valid: false, supported: false };
  }
  if (!data?.code) return { valid: false, supported: true, reason: 'invalid' };
  if (data.status === 'consumed') {
    return { valid: false, supported: true, reason: 'already_used', code };
  }
  if (data.status !== 'available' && (data.status !== 'held' || !ownedClaimToken || data.claim_token !== ownedClaimToken)) {
    return { valid: false, supported: true, reason: 'in_progress', code };
  }
  return { valid: true, supported: true, code };
}

export interface StaffCodeClaimResult {
  /** false when migration 0031 is not applied - fail closed (no discount). */
  supported: boolean;
  /** true when this call now holds the code. */
  claimed: boolean;
  error?: string;
}

/** Atomically hold a staff code for one checkout. */
export async function claimBbqStaffCode(input: {
  code: string;
  claimToken: string;
}): Promise<StaffCodeClaimResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('claim_bbq_staff_code', {
    p_code: normalizeStaffCode(input.code),
    p_claim_token: input.claimToken,
  });
  if (error) {
    if (isMissingSchema(error)) return { supported: false, claimed: false };
    console.error('[bbq-staff-code] claim failed:', error.message);
    return { supported: true, claimed: false, error: error.message };
  }
  return { supported: true, claimed: data === true };
}

/** Bind a held code to its Stripe payment intent. */
export async function bindBbqStaffCodePayment(
  claimToken: string,
  paymentIntentId: string,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc('bind_bbq_staff_code_payment', {
    p_claim_token: claimToken,
    p_payment_intent_id: paymentIntentId,
  });
  if (error) throw new Error('BBQ code binding failed');
  const { data, error: readError } = await supabase.from('bbq_staff_codes')
    .select('code').eq('claim_token', claimToken).eq('payment_intent_id', paymentIntentId).eq('status', 'held').maybeSingle();
  if (readError || !data) throw new Error('BBQ code binding could not be verified');
}

/**
 * Mark a held code used once its registration persisted. Accepts the
 * claim token (submit path) or the payment intent id (webhook /
 * persist path, where only the PI is known).
 */
export async function consumeBbqStaffCode(options: {
  claimToken?: string;
  paymentIntentId?: string;
  registrationId: string;
}): Promise<boolean> {
  const supabase = createAdminClient();
  let token = options.claimToken ?? null;
  if (!token && options.paymentIntentId) {
    const { data } = await supabase
      .from('bbq_staff_codes')
      .select('claim_token')
      .eq('payment_intent_id', options.paymentIntentId)
      .maybeSingle();
    token = data?.claim_token ?? null;
  }
  if (!token) return false;
  const { data, error } = await supabase.rpc('consume_bbq_staff_code', {
    p_claim_token: token,
    p_registration_id: options.registrationId,
  });
  if (error) {
    if (isMissingSchema(error)) return false;
    console.error('[bbq-staff-code] consume failed:', error.message);
    return false;
  }
  return data === true;
}

/** Free a held code after a checkout that was NEVER charged. */
export async function releaseBbqStaffCode(claimToken: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc('release_bbq_staff_code', {
    p_claim_token: claimToken,
  });
  if (error && !isMissingSchema(error)) {
    console.error('[bbq-staff-code] release failed:', error.message);
  }
}

export interface HeldStaffCode {
  code: string;
  claimToken: string;
}

/**
 * The code held for a payment intent, or null. A paid checkout that
 * claimed its code before being charged is never rejected afterwards:
 * this held (or already-consumed) row is its discount proof.
 * Returns undefined when the table is missing (fail closed).
 */
export async function getHeldBbqStaffCode(
  paymentIntentId: string,
): Promise<HeldStaffCode | null | undefined> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('bbq_staff_codes')
    .select('code, claim_token, status')
    .eq('payment_intent_id', paymentIntentId)
    .maybeSingle();
  if (error) {
    if (isMissingSchema(error)) return undefined;
    console.error('[bbq-staff-code] held lookup failed:', error.message);
    return undefined;
  }
  if (!data || (data.status !== 'held' && data.status !== 'consumed')) return null;
  return { code: data.code, claimToken: data.claim_token };
}

/** A paid code never frees by age. Only its cookie-owning checkout may resume
 * or cancel it; a canceled PI is terminal before a guarded release. */
export type BbqRetryResult =
  | { kind: 'available' | 'pending' | 'used' | 'failure' }
  | { kind: 'resume'; paymentIntentId: string; clientSecret: string };

export async function reconcileBbqRetryRow(
  row: { claim_token: string | null; payment_intent_id: string | null },
  input: { ownedClaimToken?: string; amountCents: number; eventSlug: string; email: string; attendees: number; sponsorAmount: number; coverFee: boolean },
  deps: {
    retrieve: (id: string) => Promise<{ id: string; status: string; amount: number; client_secret: string | null; metadata: Record<string, string> }>;
    cancel: (id: string) => Promise<{ status: string }>;
    release: () => Promise<void>;
  },
): Promise<BbqRetryResult> {
  if (!input.ownedClaimToken || row.claim_token !== input.ownedClaimToken) return { kind: 'pending' };
  try {
    if (!row.payment_intent_id) {
      await deps.release();
      return { kind: 'available' };
    }
    const pi = await deps.retrieve(row.payment_intent_id);
    if (pi.metadata.event_slug !== input.eventSlug || pi.metadata.donor_email !== input.email || pi.metadata.bbq_staff_code !== '1') return { kind: 'failure' };
    if (pi.status === 'succeeded') return { kind: 'used' };
    if (pi.status === 'canceled') {
      await deps.release();
      return { kind: 'available' };
    }
    if (pi.status === 'processing' || pi.status === 'requires_capture') return { kind: 'pending' };
    const payable = ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(pi.status);
    const sameCart = pi.metadata.attendees === String(input.attendees) &&
      pi.metadata.sponsor_amount === String(input.sponsorAmount) &&
      pi.metadata.cover_fee === (input.coverFee ? '1' : '0');
    if (payable && pi.amount === input.amountCents && sameCart && pi.client_secret) {
      return { kind: 'resume', paymentIntentId: pi.id, clientSecret: pi.client_secret };
    }
    // Never interrupt 3DS/confirmation, processing, or future statuses. Only an
    // owned retry still requiring a payment method may replace a changed cart.
    if (pi.status !== 'requires_payment_method') return { kind: 'pending' };
    const canceled = await deps.cancel(pi.id);
    if (canceled.status !== 'canceled') return { kind: 'failure' };
    await deps.release();
    return { kind: 'available' };
  } catch {
    return { kind: 'failure' };
  }
}

export async function reconcileBbqCheckout(input: {
  code: string; ownedClaimToken?: string; amountCents: number; eventSlug: string; email: string; attendees: number; sponsorAmount: number; coverFee: boolean;
}): Promise<BbqRetryResult> {
  const supabase = createAdminClient();
  const { data: row, error } = await supabase.from('bbq_staff_codes')
    .select('code, status, claim_token, payment_intent_id').eq('code', normalizeStaffCode(input.code)).maybeSingle();
  if (error || !row) return { kind: 'failure' };
  if (row.status === 'available') return { kind: 'available' };
  if (row.status === 'consumed') return { kind: 'used' };
  return reconcileBbqRetryRow(row, input, {
    retrieve: (id) => stripe.paymentIntents.retrieve(id),
    cancel: (id) => stripe.paymentIntents.cancel(id),
    release: async () => {
      let update = supabase.from('bbq_staff_codes').update({
        status: 'available', claim_token: null, payment_intent_id: null,
        expires_at: null, updated_at: new Date().toISOString(),
      }).eq('code', row.code).eq('status', 'held').eq('claim_token', row.claim_token);
      update = row.payment_intent_id ? update.eq('payment_intent_id', row.payment_intent_id) : update.is('payment_intent_id', null);
      const { data, error: releaseError } = await update.select('code');
      if (releaseError || data?.length !== 1) throw new Error('BBQ release did not affect exactly one owned hold');
    },
  });
}
