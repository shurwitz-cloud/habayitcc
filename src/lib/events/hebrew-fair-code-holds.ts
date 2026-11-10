import { createAdminClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/server';

/**
 * Race-safe Hebrew Adventure code holds for paid-event discounts
 * (Fire on Ice: 15% off one skater per code).
 *
 * DORMANT until migration 0030_hebrew_fair_code_holds is applied:
 * every function detects the missing table/RPC and reports
 * supported:false so callers fail CLOSED (no HA discount granted)
 * instead of falling back to a racy check-then-insert.
 *
 * Flow: claim the code before the Stripe payment intent is created
 * (never charge for a discount that no longer exists) -> bind the
 * payment intent id -> consume when the registration persists
 * (submit path or webhook, idempotent; writes the permanent
 * hebrew_fair_code_redemptions row) -> release on failure. Holds
 * NEVER free by time alone: rows past expires_at are reconciled
 * against Stripe's live payment-intent state before the code can be
 * re-granted (cancel if still payable, consume if paid, release if
 * canceled), and a paid discount is never rejected after charging.
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

export interface HaCodeClaimResult {
  /** false when migration 0030 is not applied - fail closed (no discount). */
  supported: boolean;
  /** true when this call now holds the code for the event. */
  claimed: boolean;
  error?: string;
}

/** Atomically hold one Hebrew Adventure code for one event. */
export async function claimHebrewFairCodeHold(input: {
  eventId: string;
  registrationId: string;
  code: string;
  claimToken: string;
}): Promise<HaCodeClaimResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('claim_hebrew_fair_code_hold', {
    p_event_id: input.eventId,
    p_registration_id: input.registrationId,
    p_code: input.code,
    p_claim_token: input.claimToken,
  });
  if (error) {
    if (isMissingSchema(error)) return { supported: false, claimed: false };
    console.error('[ha-code-holds] claim failed:', error.message);
    return { supported: true, claimed: false, error: error.message };
  }
  return { supported: true, claimed: data === true };
}

/** Bind a fresh Stripe payment intent to held codes (after PI create). */
export async function bindHebrewFairCodePayment(
  claimToken: string,
  paymentIntentId: string,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('hebrew_fair_code_holds')
    .update({ payment_intent_id: paymentIntentId, updated_at: new Date().toISOString() })
    .eq('claim_token', claimToken)
    .eq('status', 'reserved');
  if (error && !isMissingSchema(error)) {
    console.error('[ha-code-holds] bind failed:', error.message);
  }
}

/**
 * Mark held codes consumed once the registration persisted and write
 * the permanent hebrew_fair_code_redemptions rows. Idempotent.
 */
export async function consumeHebrewFairCodeHolds(
  paymentIntentId: string,
  eventRegistrationId?: string | null,
): Promise<number> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('consume_hebrew_fair_code_holds', {
    p_payment_intent_id: paymentIntentId,
    p_event_registration_id: eventRegistrationId ?? null,
  });
  if (error) {
    if (!isMissingSchema(error)) console.error('[ha-code-holds] consume failed:', error.message);
    return 0;
  }
  return Number(data) || 0;
}

/** Release held codes (checkout failed or registration did not persist). */
export async function releaseHebrewFairCodeHolds(input: {
  claimToken?: string;
  paymentIntentId?: string;
}): Promise<number> {
  if (!input.claimToken && !input.paymentIntentId) return 0;
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('release_hebrew_fair_code_holds', {
    p_claim_token: input.claimToken ?? null,
    p_payment_intent_id: input.paymentIntentId ?? null,
  });
  if (error) {
    if (!isMissingSchema(error)) console.error('[ha-code-holds] release failed:', error.message);
    return 0;
  }
  return Number(data) || 0;
}

export interface HeldHaCodeClaims {
  count: number;
  items: Array<{ registrationId: string; code: string }>;
}

/**
 * Codes currently HELD for a specific payment intent (reserved rows
 * bound to it). Returns null when migration 0030 is not applied. Used
 * at form submit: a checkout whose codes were claimed before charging
 * is never rejected afterwards - its held rows are the discount proof.
 */
export async function getHeldHebrewFairCodeClaims(
  paymentIntentId: string,
): Promise<HeldHaCodeClaims | null> {
  const supabase = createAdminClient();
  // Rows CONSUMED by this same payment intent also count: a reconcile
  // may have consumed the hold (paid PI, registration not yet
  // persisted) before the checkout's retry arrives - those codes are
  // this checkout's own discount proof, not another checkout's.
  const { data, error } = await supabase
    .from('hebrew_fair_code_holds')
    .select('id, program_registration_id, code')
    .eq('payment_intent_id', paymentIntentId)
    .in('status', ['reserved', 'consumed']);
  if (error) {
    if (isMissingSchema(error)) return null;
    console.error('[ha-code-holds] held lookup failed:', error.message);
    return null;
  }
  const items = (data ?? []).map((row) => ({
    registrationId: String(row.program_registration_id || ''),
    code: String(row.code || ''),
  }));
  return { count: items.length, items };
}

export interface HaCodeReconcileResult {
  /** false when migration 0030 is not applied. */
  supported: boolean;
  /** Holds whose Stripe state could not be determined. Fail closed. */
  failures: number;
  /** Holds whose payment is actively processing/confirming: protect
   *  from a duplicate charge by leaving the hold in place and telling
   *  the registrant the payment is still processing (not "already
   *  used"). */
  pending: number;
}

/**
 * What to do with a reserved hold given its payment intent's live
 * state. Mirrors skateHoldDisposition in skate-allowance.ts: for the
 * code's OWN current retry (unexpired hold), a PI that is actively
 * being confirmed (requires_confirmation / requires_action) is treated
 * as pending - someone may be mid-payment on it right now. For an
 * EXPIRED hold those states are canceled to reach a terminal state
 * before release, as before: a payable intent is never left dangling
 * past the hold's life.
 */
export function haHoldDisposition(
  piStatus: string | null,
  opts: { expired: boolean; owned: boolean },
): 'consume' | 'release' | 'cancel_release' | 'pending' {
  if (piStatus === null) return 'release';
  if (piStatus === 'succeeded') return 'consume';
  if (piStatus === 'canceled') return 'release';
  if (piStatus === 'requires_payment_method') {
    // Also the state of a checkout whose payer is ACTIVELY entering
    // card details in another browser: cancel only with proof this
    // request owns that checkout (its claim-token cookie).
    return opts.owned ? 'cancel_release' : 'pending';
  }
  if (piStatus === 'processing' || piStatus === 'requires_capture') return 'pending';
  // requires_confirmation / requires_action
  return opts.expired ? 'cancel_release' : 'pending';
}

/**
 * Resolve holds for one code against Stripe's live state before the
 * code can be re-granted. A hold never frees by time alone:
 *  - never bound to a payment intent -> nothing was payable, release;
 *  - PI succeeded -> consume (payment exists; registration recovery is
 *    handled by the existing admin tooling) and log loudly;
 *  - PI canceled -> release;
 *  - PI unfinished and never charged (requires_payment_method) ->
 *    cancel to a terminal state, then release (no refund is involved);
 *  - PI processing / actively confirming / Stripe unreachable -> leave
 *    the hold (fail closed, caller reports pending/unverified instead
 *    of granting).
 */

// Same injectable seam as the skate reconcile: decision + side effects
// for one hold row with stubbed Stripe/DB clients in tests.
export interface HaHoldRowDeps {
  retrieve: (piId: string) => Promise<{ status: string }>;
  cancel: (piId: string) => Promise<unknown>;
  consume: (piId: string) => Promise<unknown>;
  releaseByPi: (piId: string) => Promise<unknown>;
  onOrphanPaid?: (piId: string) => void;
}

export async function reconcileHebrewFairHoldRow(
  piId: string,
  opts: { expired: boolean; owned: boolean },
  deps: HaHoldRowDeps,
): Promise<'consumed' | 'released' | 'pending' | 'failure'> {
  try {
    const pi = await deps.retrieve(piId);
    const disposition = haHoldDisposition(pi.status, opts);
    if (disposition === 'consume') {
      await deps.consume(piId);
      deps.onOrphanPaid?.(piId);
      return 'consumed';
    }
    if (disposition === 'release') {
      await deps.releaseByPi(piId);
      return 'released';
    }
    if (disposition === 'pending') return 'pending';
    // If the PI moved to processing/paid since retrieve, Stripe's
    // cancel throws here and the row reports failure (hold intact).
    await deps.cancel(piId);
    await deps.releaseByPi(piId);
    return 'released';
  } catch {
    return 'failure';
  }
}

async function reconcileHebrewFairCodeHolds(input: {
  eventId: string;
  registrationId: string;
  onlyExpired: boolean;
  // Claim tokens this request owns (checkout-ownership cookie); only
  // matching holds may be canceled. Undefined (hourly expired
  // reconciler) means age already proved abandonment.
  ownedClaimTokens?: string[];
}): Promise<HaCodeReconcileResult> {
  const supabase = createAdminClient();
  let query = supabase
    .from('hebrew_fair_code_holds')
    .select('id, claim_token, payment_intent_id')
    .eq('event_id', input.eventId)
    .eq('program_registration_id', input.registrationId)
    .eq('status', 'reserved');
  if (input.onlyExpired) query = query.lt('expires_at', new Date().toISOString());
  const { data: rows, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { supported: false, failures: 0, pending: 0 };
    console.error('[ha-code-holds] reconcile query failed:', error.message);
    return { supported: true, failures: 1, pending: 0 };
  }
  let failures = 0;
  let pending = 0;
  for (const row of rows ?? []) {
    const piId = (row.payment_intent_id as string | null) || null;
    if (!piId) {
      await releaseHebrewFairCodeHolds({ claimToken: String(row.claim_token) });
      continue;
    }
    const owned =
      input.ownedClaimTokens === undefined ||
      input.ownedClaimTokens.includes(String(row.claim_token));
    const outcome = await reconcileHebrewFairHoldRow(
      piId,
      { expired: input.onlyExpired, owned },
      {
        retrieve: (id) => stripe.paymentIntents.retrieve(id),
        cancel: (id) => stripe.paymentIntents.cancel(id),
        consume: (id) => consumeHebrewFairCodeHolds(id),
        releaseByPi: (id) => releaseHebrewFairCodeHolds({ paymentIntentId: id }),
        onOrphanPaid: (id) =>
          console.error(
            `[ha-code-holds] paid PI ${id} had no persisted registration; admin recovery needed`,
          ),
      },
    );
    if (outcome === 'pending') pending += 1;
    else if (outcome === 'failure') {
      console.error('[ha-code-holds] reconcile failed for PI', piId);
      failures += 1;
    }
  }
  return { supported: true, failures, pending };
}

/**
 * Resolve EXPIRED holds (older than expires_at) for one code. Kept for
 * paths that must not touch a hold a payer could still be completing.
 */
export async function reconcileExpiredHebrewFairCodeHolds(input: {
  eventId: string;
  registrationId: string;
}): Promise<HaCodeReconcileResult> {
  return reconcileHebrewFairCodeHolds({ ...input, onlyExpired: true });
}

/**
 * Resolve the code's OWN reserved holds for this event, expired or not.
 * Called from the payment-intent route with the verified code, so a
 * retrying registrant is never blocked by their own unfinished or
 * failed checkout ("already used" means a completed paid registration
 * only). A hold whose payment is actively processing is left in place
 * and reported as pending - never canceled under a possible payer.
 */
export async function reconcileOwnHebrewFairCodeHolds(input: {
  eventId: string;
  registrationId: string;
  ownedClaimTokens: string[];
}): Promise<HaCodeReconcileResult> {
  return reconcileHebrewFairCodeHolds({ ...input, onlyExpired: false });
}
