import type { Payment } from '@/types/database';
import type { CrmSnapshot } from './types';

export type PaymentParty = {
  name: string;
  email: string | null;
  sourceLabel: string;
};

export function paymentSourceLabel(sourceType: string): string {
  switch (sourceType) {
    case 'donation':
      return 'Donation';
    case 'chai_partner':
      return 'Chai partner';
    case 'program_registration':
      return 'Program registration';
    case 'event_registration':
      return 'Event registration';
    default:
      return sourceType.replace(/_/g, ' ');
  }
}

function partyFromRsvp(
  rsvp: CrmSnapshot['rsvps'][number],
  sourceLabel: string,
): PaymentParty {
  return {
    name: `${rsvp.first_name} ${rsvp.last_name}`.trim(),
    email: rsvp.email ?? null,
    sourceLabel: rsvp.eventTitle ? `Event · ${rsvp.eventTitle}` : sourceLabel,
  };
}

function amountsCompatible(payAmount: number, rsvpAmount: number): boolean {
  if (!Number.isFinite(payAmount) || payAmount <= 0) return false;
  if (!Number.isFinite(rsvpAmount) || rsvpAmount <= 0) return false;
  if (Math.abs(rsvpAmount - payAmount) < 0.05) return true;
  // Ticket total vs Stripe total with ~3% fee
  if (Math.abs(rsvpAmount * 1.03 - payAmount) < 0.15) return true;
  if (Math.abs(payAmount * 1.03 - rsvpAmount) < 0.15) return true;
  return false;
}

/**
 * Match orphaned event payments to an RSVP by source id, PaymentIntent,
 * then amount + time (including RSVPs with missing amount).
 */
export function findEventRsvpForPayment(
  p: Payment,
  snapshot: CrmSnapshot,
): CrmSnapshot['rsvps'][number] | null {
  const byId = snapshot.rsvps.find((r) => r.id === p.source_id);
  if (byId) return byId;

  if (p.stripe_payment_intent_id) {
    const byPi = snapshot.rsvps.find(
      (r) => r.stripe_payment_intent_id === p.stripe_payment_intent_id,
    );
    if (byPi) return byPi;
  }

  const payAmount = Number(p.amount);
  const payTime = new Date(p.paid_at ?? p.created_at).getTime();
  if (!Number.isFinite(payTime)) return null;

  let best: CrmSnapshot['rsvps'][number] | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const r of snapshot.rsvps) {
    if (!amountsCompatible(payAmount, Number(r.amount))) continue;

    const delta = Math.abs(new Date(r.created_at).getTime() - payTime);
    // Same checkout / duplicate race window.
    if (delta > 3 * 60 * 60 * 1000) continue;
    if (delta < bestDelta) {
      bestDelta = delta;
      best = r;
    }
  }

  // Time-only fallback when RSVP money columns are empty: nearest RSVP ≤20 min.
  if (!best && Number.isFinite(payAmount) && payAmount > 0) {
    bestDelta = Number.POSITIVE_INFINITY;
    for (const r of snapshot.rsvps) {
      const delta = Math.abs(new Date(r.created_at).getTime() - payTime);
      if (delta > 20 * 60 * 1000) continue;
      if (delta < bestDelta) {
        bestDelta = delta;
        best = r;
      }
    }
  }

  return best;
}

/** Resolve payer name/email from the linked donation, chai partner, family, or event RSVP. */
export function resolvePaymentParty(p: Payment, snapshot: CrmSnapshot): PaymentParty {
  const sourceLabel = paymentSourceLabel(String(p.source_type || ''));

  if (p.source_type === 'donation') {
    const d = snapshot.donations.find((x) => x.id === p.source_id);
    if (d) {
      return {
        name: `${d.first_name} ${d.last_name}`.trim(),
        email: d.email,
        sourceLabel,
      };
    }
  }

  if (p.source_type === 'chai_partner') {
    const c = snapshot.chaiPartners.find((x) => x.id === p.source_id);
    if (c) {
      return {
        name: `${c.first_name} ${c.last_name}`.trim(),
        email: c.email,
        sourceLabel,
      };
    }
  }

  if (p.source_type === 'program_registration') {
    const family = snapshot.families.find(
      (f) => f.id === p.source_id || f.registrations.some((r) => r.id === p.source_id),
    );
    if (family) {
      const primary = family.parents.find((x) => x.is_primary_contact) ?? family.parents[0];
      return {
        name: family.familyName,
        email: primary?.email ?? null,
        sourceLabel,
      };
    }
  }

  if (p.source_type === 'event_registration') {
    const rsvp = findEventRsvpForPayment(p, snapshot);
    if (rsvp) return partyFromRsvp(rsvp, sourceLabel);
  }

  return { name: '', email: null, sourceLabel };
}

/**
 * Re-point event_registration payments whose source_id is missing/orphan
 * onto the best matching kept RSVP (in-memory). Caller may persist updates.
 */
export function relinkOrphanedEventPayments(
  payments: Payment[],
  rsvps: CrmSnapshot['rsvps'],
): { payments: Payment[]; remaps: Array<{ paymentId: string; fromId: string; toId: string }> } {
  const rsvpIds = new Set(rsvps.map((r) => r.id));
  const snapshot = { rsvps } as CrmSnapshot;
  const remaps: Array<{ paymentId: string; fromId: string; toId: string }> = [];

  const next = payments.map((p) => {
    if (p.source_type !== 'event_registration') return p;
    if (rsvpIds.has(p.source_id)) return p;

    const match = findEventRsvpForPayment(p, snapshot);
    if (!match || match.id === p.source_id) return p;

    remaps.push({ paymentId: p.id, fromId: p.source_id, toId: match.id });
    return { ...p, source_id: match.id };
  });

  return { payments: next, remaps };
}
