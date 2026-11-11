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
 * right after persist. Holds NEVER free by time alone: an expired
 * hold is reconciled against Stripe's live payment-intent state
 * (cancel if still payable, consume if paid, release if canceled),
 * and a paid discount is never rejected after charging.
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
  reason?: 'invalid' | 'already_used';
  code?: string;
}

/** Verify a staff code for live form feedback (no claim). */
export async function verifyBbqStaffCode(codeRaw: string): Promise<StaffCodeLookup> {
  const code = normalizeStaffCode(codeRaw);
  if (code.length < 6) return { valid: false, supported: true, reason: 'invalid' };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('bbq_staff_codes')
    .select('code, status')
    .eq('code', code)
    .maybeSingle();

  if (error) {
    if (isMissingSchema(error)) return { valid: false, supported: false };
    console.error('[bbq-staff-code] lookup failed:', error.message);
    return { valid: false, supported: false };
  }
  if (!data?.code) return { valid: false, supported: true, reason: 'invalid' };
  if (data.status !== 'available') {
    return { valid: false, supported: true, reason: 'already_used', code };
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
  if (error) console.error('[bbq-staff-code] bind failed:', error.message);
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

/**
 * Reconcile an expired hold for one code against Stripe's live
 * payment state before the code can be re-granted: a succeeded PI
 * consumes the code (and is logged for admin recovery), a PI that
 * can still be paid is canceled and the hold kept, a canceled one
 * frees the code. A hold with no payment was never charged and is
 * simply freed.
 */
export async function reconcileExpiredBbqStaffCode(codeRaw: string): Promise<{
  supported: boolean;
  failures: number;
}> {
  const code = normalizeStaffCode(codeRaw);
  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from('bbq_staff_codes')
    .select('code, status, payment_intent_id, expires_at')
    .eq('code', code)
    .maybeSingle();
  if (error) {
    if (isMissingSchema(error)) return { supported: false, failures: 0 };
    console.error('[bbq-staff-code] reconcile lookup failed:', error.message);
    return { supported: false, failures: 1 };
  }
  if (!row || row.status !== 'held') return { supported: true, failures: 0 };
  if (!row.expires_at || new Date(row.expires_at) > new Date()) {
    return { supported: true, failures: 0 };
  }

  let resolution: 'consumed' | 'available' = 'available';
  if (row.payment_intent_id) {
    try {
      const pi = await stripe.paymentIntents.retrieve(row.payment_intent_id);
      if (pi.status === 'succeeded') {
        resolution = 'consumed';
        console.error(
          `[bbq-staff-code] expired hold on paid PI ${row.payment_intent_id}: consumed without a persisted registration; needs admin recovery.`,
        );
      } else if (pi.status === 'requires_payment_method' || pi.status === 'requires_confirmation' || pi.status === 'requires_action' || pi.status === 'processing') {
        // Still payable: cancel it so the code can be safely re-granted.
        try {
          await stripe.paymentIntents.cancel(row.payment_intent_id);
        } catch {
          // already moved on; treat as still payable and keep the hold
          return { supported: true, failures: 1 };
        }
        resolution = 'available';
      } else {
        resolution = 'available';
      }
    } catch {
      console.error('[bbq-staff-code] Stripe reconcile failed for', row.payment_intent_id);
      return { supported: true, failures: 1 };
    }
  }

  const { data: resolved, error: resolveError } = await supabase.rpc(
    'resolve_expired_bbq_staff_code',
    { p_code: code, p_resolution: resolution },
  );
  if (resolveError) {
    if (isMissingSchema(resolveError)) return { supported: false, failures: 0 };
    console.error('[bbq-staff-code] resolve failed:', resolveError.message);
    return { supported: true, failures: 1 };
  }
  return { supported: true, failures: resolved === true ? 0 : 1 };
}
