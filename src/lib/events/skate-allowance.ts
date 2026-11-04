import { createAdminClient } from '@/lib/supabase/server';

/**
 * Race-safe Chai allowance reservations for skate events (Fire on Ice).
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
 * idempotent) -> release on failure. Expired holds stop counting on
 * their own; rows are never deleted so a late-completing payment can
 * still be reconciled by payment_intent_id.
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
 * Slots currently used (consumed + unexpired holds) from the reservation
 * table, or null when migration 0028 is not applied (caller falls back
 * to the registration scan).
 */
export async function skateAllowanceUsed(input: {
  eventId: string;
  partnerId: string;
}): Promise<number | null> {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from('chai_event_skate_reservations')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', input.eventId)
    .eq('partner_id', input.partnerId)
    .or(`status.eq.consumed,and(status.eq.reserved,expires_at.gt.${new Date().toISOString()})`);
  if (error) {
    if (isMissingSchema(error)) return null;
    console.error('[skate-allowance] usage count failed:', error.message);
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
  const { data, error } = await supabase
    .from('chai_event_skate_reservations')
    .select('id, partner_id, code')
    .eq('payment_intent_id', paymentIntentId)
    .eq('status', 'reserved');
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
