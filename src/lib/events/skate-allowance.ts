import { createAdminClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/server';

/**
 * Race-safe Chai allowance reservations for skate events (Fire on Ice).
 *
 * One row per discounted PERSON slot (skater or non-skater pass). A Chai
 * member may discount ONE reservation per event: the checkout claims the
 * member's whole entitlement (SKATE_ALLOWANCE_LIMIT slots) atomically,
 * all-or-nothing, so no second discounted checkout can run alongside.
 *
 * DORMANT until migration 0028_skate_allowance_reservations is applied:
 * every function detects the missing table/RPC and reports
 * supported:false so callers fall back to the registration-scan
 * allowance check. Once applied, this table is the allowance source of
 * truth (consumed + unexpired reserved rows) - registrations are NOT
 * scanned on top, so nothing is double-counted. The event goes live
 * after the migration, so no pre-migration skate registrations exist.
 *
 * Flow: claim slots before the Stripe payment intent is created (never
 * charge for an unavailable discount) -> bind the payment intent id ->
 * consume when the registration persists (submit path or webhook,
 * idempotent) -> release on failure. Holds NEVER free by time alone:
 * rows past expires_at are reconciled against Stripe's live
 * payment-intent state before their slots can be re-granted (cancel
 * if still payable, consume if paid, release if canceled), and a
 * paid discount is never rejected after charging.
 */

export const SKATE_ALLOWANCE_LIMIT = 6;

interface RpcError {
  code?: string;
  message?: string;
}

function isMissingSchema(error: RpcError | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01') return true;
  return /could not find|does not exist|relation .* does not exist/i.test(error.message || '');
}

export interface SkateClaimResult {
  /** false when migration 0028 is not applied - use the legacy scan. */
  supported: boolean;
  /** Discounted slots actually granted (0..wanted). */
  claimed: number;
  claimToken: string;
  error?: string;
}

/** Atomically claim up to `wanted` discounted skater slots for a member. */
export async function claimSkateAllowance(input: {
  eventId: string;
  partnerId: string;
  code: string;
  wanted: number;
  claimToken: string;
  limit?: number;
}): Promise<SkateClaimResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('claim_skate_allowance', {
    p_event_id: input.eventId,
    p_partner_id: input.partnerId,
    p_code: input.code,
    p_wanted: Math.max(0, Math.round(input.wanted)),
    p_claim_token: input.claimToken,
    p_limit: input.limit ?? SKATE_ALLOWANCE_LIMIT,
  });
  if (error) {
    if (isMissingSchema(error)) return { supported: false, claimed: 0, claimToken: input.claimToken };
    console.error('[skate-allowance] claim failed:', error.message);
    return { supported: true, claimed: 0, claimToken: input.claimToken, error: error.message };
  }
  return { supported: true, claimed: Number(data) || 0, claimToken: input.claimToken };
}

/** Bind a fresh Stripe payment intent to its held slots (after PI create). */
export async function bindSkateAllowancePayment(
  claimToken: string,
  paymentIntentId: string,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('chai_event_skate_reservations')
    .update({ payment_intent_id: paymentIntentId, updated_at: new Date().toISOString() })
    .eq('claim_token', claimToken)
    .eq('status', 'reserved');
  if (error && !isMissingSchema(error)) {
    console.error('[skate-allowance] bind failed:', error.message);
  }
}

/** Mark held slots consumed once the registration persisted. Idempotent. */
export async function consumeSkateAllowance(paymentIntentId: string): Promise<number> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('consume_skate_allowance', {
    p_payment_intent_id: paymentIntentId,
  });
  if (error) {
    if (!isMissingSchema(error)) console.error('[skate-allowance] consume failed:', error.message);
    return 0;
  }
  return Number(data) || 0;
}

/** Release held slots (checkout failed or registration did not persist). */
export async function releaseSkateAllowance(input: {
  claimToken?: string;
  paymentIntentId?: string;
}): Promise<number> {
  if (!input.claimToken && !input.paymentIntentId) return 0;
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('release_skate_allowance', {
    p_claim_token: input.claimToken ?? null,
    p_payment_intent_id: input.paymentIntentId ?? null,
  });
  if (error) {
    if (!isMissingSchema(error)) console.error('[skate-allowance] release failed:', error.message);
    return 0;
  }
  return Number(data) || 0;
}

/**
 * Slots PAID for this event (consumed rows) - the only rows that make a
 * member's code "already used". Unfinished or failed checkouts
 * (reserved rows) do NOT count as used: the payment route reconciles
 * the member's own holds against Stripe's live state and releases the
 * ones that were never paid. Returns null when migration 0028 is not
 * applied (caller falls back to the registration scan). The atomic
 * claim (migration 0029) still counts every reserved row and remains
 * the final gate against two discounted checkouts running at once.
 */
export async function skateAllowanceConsumed(input: {
  eventId: string;
  partnerId: string;
}): Promise<number | null> {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from('chai_event_skate_reservations')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', input.eventId)
    .eq('partner_id', input.partnerId)
    .eq('status', 'consumed');
  if (error) {
    if (isMissingSchema(error)) return null;
    console.error('[skate-allowance] consumed count failed:', error.message);
    return null;
  }
  return count ?? 0;
}

/**
 * Slots currently HELD for a specific payment intent (reserved rows bound
 * to it). Returns null when migration 0028 is not applied. Used at form
 * submit: a checkout whose allowance was claimed before charging is never
 * rejected afterwards - its held rows are the discount proof.
 */
export async function getHeldSkateAllowance(
  paymentIntentId: string,
): Promise<{ count: number; partnerId: string; code: string } | null> {
  const supabase = createAdminClient();
  // Rows CONSUMED by this same payment intent also count: a reconcile
  // may have consumed the hold (paid PI, registration not yet
  // persisted) before the checkout's retry arrives - those slots are
  // this checkout's own discount proof, not another checkout's.
  const { data, error } = await supabase
    .from('chai_event_skate_reservations')
    .select('id, partner_id, code')
    .eq('payment_intent_id', paymentIntentId)
    .in('status', ['reserved', 'consumed']);
  if (error) {
    if (isMissingSchema(error)) return null;
    console.error('[skate-allowance] held lookup failed:', error.message);
    return null;
  }
  const rows = data ?? [];
  if (!rows.length) return { count: 0, partnerId: '', code: '' };
  return {
    count: rows.length,
    partnerId: String(rows[0].partner_id || ''),
    code: String(rows[0].code || ''),
  };
}

export interface SkateReconcileResult {
  /** false when migration 0028 is not applied. */
  supported: boolean;
  /** Holds whose Stripe state could not be determined. Fail closed. */
  failures: number;
  /** Holds whose payment is actively processing/confirming: protect
   *  from a duplicate charge by leaving the slots in place and telling
   *  the registrant the payment is still processing (not "already
   *  used"). */
  pending: number;
  /** Owned, unexpired, amount-matching still-payable checkouts that
   *  can be RESUMED (return the same client_secret) instead of
   *  cancel+recreate. At most one per member in practice (the claim
   *  is entitlement-wide). */
  resumes: { paymentIntentId: string; clientSecret: string | null; claimToken: string }[];
}

export type SkateHoldDisposition =
  | 'consume' // PI paid: consume the slots (registration recovery is separate)
  | 'release' // PI canceled or never bound: nothing payable, free the slots
  | 'cancel_release' // PI unfinished and never charged: cancel to a terminal state, then free the slots
  | 'pending'; // PI actively processing/confirming: protect from a duplicate charge, leave the slots

/**
 * What to do with a reserved hold given its payment intent's live
 * state. For a hold from the member's OWN current retry (unexpired),
 * a PI that is actively being confirmed (requires_confirmation /
 * requires_action) is treated as pending - someone may be mid-payment
 * on it right now. For an EXPIRED hold (older than expires_at), those
 * states are canceled to reach a terminal state before release, as
 * before: a payable intent is never left dangling past the hold's life.
 */
export function skateHoldDisposition(
  piStatus: string | null,
  opts: { expired: boolean; owned: boolean },
): SkateHoldDisposition {
  if (piStatus === null) return 'release';
  if (piStatus === 'succeeded') return 'consume';
  if (piStatus === 'canceled') return 'release';
  if (piStatus === 'requires_payment_method') {
    // requires_payment_method is also the state of a checkout whose
    // payer is ACTIVELY entering card details in another browser.
    // Cancel only when this request proves it owns that checkout
    // (its claim-token cookie); a foreign one stays pending.
    return opts.owned ? 'cancel_release' : 'pending';
  }
  if (piStatus === 'processing' || piStatus === 'requires_capture') return 'pending';
  if (piStatus === 'requires_confirmation' || piStatus === 'requires_action') {
    // A live payer may be mid-confirmation - cancel only once the
    // hold is expired (the abandonment proxy).
    return opts.expired ? 'cancel_release' : 'pending';
  }
  // Unknown/future Stripe status: never cancel; fail closed.
  return 'pending';
}


// Injectable seam for one hold row: the disposition decision plus its
// side effects, with the Stripe/DB clients supplied by the caller so
// tests can stub retrieve/cancel races (e.g. a PI that transitions to
// processing between retrieve and cancel -> cancel throws -> failure,
// hold left intact).
export interface SkateHoldRowDeps {
  retrieve: (piId: string) => Promise<{ status: string; amount?: number; client_secret?: string | null }>;
  cancel: (piId: string) => Promise<unknown>;
  consume: (piId: string) => Promise<unknown>;
  releaseByPi: (piId: string) => Promise<unknown>;
  onOrphanPaid?: (piId: string) => void;
}

export type SkateHoldRowResult =
  | { outcome: 'consumed' | 'released' | 'pending' | 'failure' }
  | { outcome: 'resume'; paymentIntentId: string; clientSecret: string | null };

export async function reconcileSkateHoldRow(
  piId: string,
  opts: { expired: boolean; owned: boolean; resumeAmountCents?: number },
  deps: SkateHoldRowDeps,
): Promise<SkateHoldRowResult> {
  try {
    const pi = await deps.retrieve(piId);
    const disposition = skateHoldDisposition(pi.status, opts);
    if (disposition === 'consume') {
      await deps.consume(piId);
      deps.onOrphanPaid?.(piId);
      return { outcome: 'consumed' };
    }
    if (disposition === 'release') {
      await deps.releaseByPi(piId);
      return { outcome: 'released' };
    }
    // RESUME an owned, unexpired, still-payable checkout whose amount
    // matches the current cart: hand back the SAME payment intent
    // instead of canceling. A second tab mid-3DS stays alive; both
    // tabs share one PI, confirm is idempotent per PI (a succeeded PI
    // re-confirms as succeeded), so no double charge is possible.
    if (
      opts.owned &&
      !opts.expired &&
      opts.resumeAmountCents != null &&
      pi.amount === opts.resumeAmountCents &&
      (pi.status === 'requires_payment_method' ||
        pi.status === 'requires_confirmation' ||
        pi.status === 'requires_action')
    ) {
      return { outcome: 'resume', paymentIntentId: piId, clientSecret: pi.client_secret ?? null };
    }
    if (disposition === 'pending') {
      // Not safe to cancel/reallocate; leave the hold counting.
      return { outcome: 'pending' };
    }
    // cancel_release: an owned amount-changed retry, or an expired
    // hold, whose PI was never charged. Cancellation is attempted
    // only from requires_payment_method (or expired
    // requires_confirmation/requires_action). Residual race: if the
    // PI moved to processing since retrieve, Stripe usually rejects
    // the cancel (the row reports failure, hold intact); in Stripe's
    // rare documented processing-cancel case the in-flight payment is
    // interrupted instead - still never charged, no double charge
    // possible (a canceled PI can never capture), and the payer's
    // next submit heals.
    await deps.cancel(piId);
    await deps.releaseByPi(piId);
    return { outcome: 'released' };
  } catch {
    return { outcome: 'failure' };
  }
}

async function reconcileSkateHolds(input: {
  eventId: string;
  partnerId: string;
  onlyExpired: boolean;
  // Claim tokens this request owns (checkout-ownership cookie). Only
  // holds carrying one of these tokens may be canceled or resumed;
  // undefined (the expired-hold reconciler) means age already proved
  // abandonment, so every expired row is treated as owned.
  ownedClaimTokens?: string[];
  // When set, an owned unexpired still-payable PI with exactly this
  // amount is RESUMED (same PI returned) instead of canceled.
  resumeAmountCents?: number;
}): Promise<SkateReconcileResult> {
  const supabase = createAdminClient();
  let query = supabase
    .from('chai_event_skate_reservations')
    .select('id, claim_token, payment_intent_id, expires_at')
    .eq('event_id', input.eventId)
    .eq('partner_id', input.partnerId)
    .eq('status', 'reserved');
  if (input.onlyExpired) query = query.lt('expires_at', new Date().toISOString());
  const { data: rows, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { supported: false, failures: 0, pending: 0, resumes: [] };
    console.error('[skate-allowance] reconcile query failed:', error.message);
    return { supported: true, failures: 1, pending: 0, resumes: [] };
  }
  let failures = 0;
  let pending = 0;
  const resumes: SkateReconcileResult['resumes'] = [];
  // Rows of one claim share a payment_intent_id: process each PI once.
  const seenPi = new Set<string>();
  const now = Date.now();
  for (const row of rows ?? []) {
    const piId = (row.payment_intent_id as string | null) || null;
    if (!piId) {
      await releaseSkateAllowance({ claimToken: String(row.claim_token) });
      continue;
    }
    if (seenPi.has(piId)) continue;
    seenPi.add(piId);
    const owned =
      input.ownedClaimTokens === undefined ||
      input.ownedClaimTokens.includes(String(row.claim_token));
    // Per-row expiry (P2c): own-reconcile also heals rows already past
    // their TTL, without waiting on any scheduled reconciler.
    const expired =
      input.onlyExpired ||
      (row.expires_at ? Date.parse(String(row.expires_at)) <= now : false);
    const result = await reconcileSkateHoldRow(
      piId,
      { expired, owned, resumeAmountCents: input.resumeAmountCents },
      {
        retrieve: (id) => stripe.paymentIntents.retrieve(id),
        cancel: (id) => stripe.paymentIntents.cancel(id),
        consume: async (id) => {
          const n = await consumeSkateAllowance(id);
          if (!n) throw new Error(`consume affected 0 rows for ${id}`);
        },
        releaseByPi: async (id) => {
          const n = await releaseSkateAllowance({ paymentIntentId: id });
          if (!n) throw new Error(`release affected 0 rows for ${id}`);
        },
        onOrphanPaid: (id) =>
          console.error(
            `[skate-allowance] paid PI ${id} had no persisted registration; admin recovery needed`,
          ),
      },
    );
    if (result.outcome === 'pending') pending += 1;
    else if (result.outcome === 'failure') {
      console.error('[skate-allowance] reconcile failed for PI', piId);
      failures += 1;
    } else if (result.outcome === 'resume') {
      resumes.push({
        paymentIntentId: result.paymentIntentId,
        clientSecret: result.clientSecret,
        claimToken: String(row.claim_token),
      });
    }
  }
  return { supported: true, failures, pending, resumes };
}

/**
 * Resolve EXPIRED holds (older than expires_at) against Stripe's live
 * state before the allowance can re-grant their slots. A hold never
 * frees by time alone. Kept for paths that must not touch a hold a
 * payer could still be completing.
 */
export async function reconcileExpiredSkateHolds(input: {
  eventId: string;
  partnerId: string;
}): Promise<SkateReconcileResult> {
  return reconcileSkateHolds({ ...input, onlyExpired: true });
}

/**
 * Resolve the member's OWN reserved holds for this event, expired or
 * not. Called from the payment-intent route AFTER identity match, so a
 * retrying member is never blocked by their own unfinished or failed
 * checkout ("already used" means a completed paid registration only).
 * A hold whose payment is actively processing is left in place and
 * reported as pending - never canceled under a possible payer.
 */
export async function reconcileOwnSkateHolds(input: {
  eventId: string;
  partnerId: string;
  ownedClaimTokens: string[];
  resumeAmountCents?: number;
}): Promise<SkateReconcileResult> {
  return reconcileSkateHolds({ ...input, onlyExpired: false });
}
