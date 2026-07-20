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
    default:
      return sourceType.replace(/_/g, ' ');
  }
}

/** Resolve payer name/email from the linked donation, chai partner, or family. */
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

  return { name: '', email: null, sourceLabel };
}
