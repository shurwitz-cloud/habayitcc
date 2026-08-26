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

/** Resolve payer name/email from the linked donation, chai partner, family, or event RSVP. */
export function resolvePaymentParty(p: Payment, snapshot: CrmSnapshot): PaymentParty {
  const sourceLabel = paymentSourceLabel(p.source_type);

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
    const rsvp = snapshot.rsvps.find((r) => r.id === p.source_id);
    if (rsvp) {
      return {
        name: `${rsvp.first_name} ${rsvp.last_name}`.trim(),
        email: rsvp.email ?? null,
        sourceLabel: rsvp.eventTitle
          ? `Event · ${rsvp.eventTitle}`
          : sourceLabel,
      };
    }
    // Fallback: match by Stripe PaymentIntent if source_id was lost/deduped.
    if (p.stripe_payment_intent_id) {
      const byPi = snapshot.rsvps.find(
        (r) => r.stripe_payment_intent_id === p.stripe_payment_intent_id,
      );
      if (byPi) {
        return {
          name: `${byPi.first_name} ${byPi.last_name}`.trim(),
          email: byPi.email ?? null,
          sourceLabel: byPi.eventTitle
            ? `Event · ${byPi.eventTitle}`
            : sourceLabel,
        };
      }
    }
  }

  return { name: '', email: null, sourceLabel };
}
