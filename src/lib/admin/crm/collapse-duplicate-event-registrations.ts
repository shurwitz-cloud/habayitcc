import { normalizeDonorEmail } from '@/lib/donations/normalize-donor';
import type { EventRegistration } from '@/types/database';

/**
 * Collapse form+webhook double inserts: one row per email + event_slug.
 * Prefers row with Stripe PI, then higher amount, then newest.
 */
export function collapseDuplicateEventRegistrations<
  T extends Pick<
    EventRegistration,
    | 'id'
    | 'email'
    | 'event_slug'
    | 'created_at'
    | 'amount'
    | 'sponsor_amount'
    | 'stripe_payment_intent_id'
  >,
>(rows: T[]): { kept: T[]; duplicateIds: string[] } {
  const groups = new Map<string, T[]>();

  for (const row of rows) {
    const email = normalizeDonorEmail(row.email || '');
    const slug = (row.event_slug || '').trim();
    if (!email || !slug) {
      const key = `id:${row.id}`;
      groups.set(key, [row]);
      continue;
    }
    const key = `${email}::${slug}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  function score(r: T): number {
    let s = 0;
    if (r.stripe_payment_intent_id) s += 1_000_000;
    s += Number(r.amount || 0) * 100;
    s += Number(r.sponsor_amount || 0);
    s += new Date(r.created_at).getTime() / 1e8;
    return s;
  }

  const kept: T[] = [];
  const duplicateIds: string[] = [];

  for (const list of groups.values()) {
    if (list.length === 1) {
      kept.push(list[0]);
      continue;
    }
    const sorted = [...list].sort((a, b) => score(b) - score(a));
    kept.push(sorted[0]);
    for (const dup of sorted.slice(1)) duplicateIds.push(dup.id);
  }

  return { kept, duplicateIds };
}
