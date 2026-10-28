import { resolvePaymentParty } from './payment-party';
import type { CrmActivityItem, CrmSnapshot } from './types';

const TYPE_LABELS: Record<CrmActivityItem['type'], string> = {
  contact: 'Contact',
  donation: 'Donation',
  chai: 'Chai partner',
  family: 'Application',
  payment: 'Payment',
  rsvp: 'RSVP',
};

export function activityTypeLabel(type: CrmActivityItem['type']): string {
  return TYPE_LABELS[type] ?? type;
}

export function buildActivityFeed(snapshot: CrmSnapshot): CrmActivityItem[] {
  const items: CrmActivityItem[] = [];

  for (const c of snapshot.contacts) {
    // Keep Contacts tab complete; don't flood Activity with quiet historical imports.
    const msg = (c.message || '').toLowerCase();
    if (
      msg.includes('--- event import') ||
      msg.includes('--- stripe import')
    ) {
      continue;
    }
    items.push({
      id: `contact-${c.id}`,
      type: 'contact',
      title: `${c.first_name} ${c.last_name}`.trim(),
      subtitle: c.interest ?? 'Contact form',
      email: c.email,
      amount: null,
      status: c.is_resolved ? 'resolved' : 'open',
      createdAt: c.created_at,
      recordId: c.id,
    });
  }

  for (const d of snapshot.donations) {
    items.push({
      id: `donation-${d.id}`,
      type: 'donation',
      title: `${d.first_name} ${d.last_name}`.trim(),
      subtitle: d.donation_type
        ? `Donation · ${d.donation_type.replace(/_/g, ' ')}`
        : 'Donation',
      email: d.email,
      amount: Number(d.amount),
      status: d.status,
      createdAt: d.created_at,
      recordId: d.id,
    });
  }

  for (const c of snapshot.chaiPartners) {
    items.push({
      id: `chai-${c.id}`,
      type: 'chai',
      title: `${c.first_name} ${c.last_name}`.trim(),
      subtitle: 'Chai partner',
      email: c.email,
      amount: Number(c.monthly_amount),
      status: c.status,
      createdAt: c.created_at,
      recordId: c.id,
    });
  }

  for (const f of snapshot.families) {
    // Only real program applications — bare CRM families (event/Stripe import
    // households) must not flood Activity as "Application" with today's date.
    if (!f.registrations.length) continue;
    const primary = f.parents.find((p) => p.is_primary_contact) ?? f.parents[0];
    items.push({
      id: `family-${f.id}`,
      type: 'family',
      title: f.familyName,
      subtitle: `${f.children.length} child${f.children.length === 1 ? '' : 'ren'} · ${f.registrations.length} registration${f.registrations.length === 1 ? '' : 's'}`,
      email: primary?.email ?? null,
      amount: null,
      status: f.registrations[0]?.status ?? null,
      createdAt: f.createdAt,
      recordId: f.id,
    });
  }

  for (const p of snapshot.payments) {
    const party = resolvePaymentParty(p, snapshot);
    items.push({
      id: `payment-${p.id}`,
      type: 'payment',
      title: party.name || 'Unknown payer',
      subtitle: party.sourceLabel,
      email: party.email,
      amount: Number(p.amount),
      status: p.status,
      createdAt: p.paid_at ?? p.created_at,
      recordId: p.id,
    });
  }

  for (const r of snapshot.rsvps) {
    items.push({
      id: `rsvp-${r.id}`,
      type: 'rsvp',
      title: `${r.first_name} ${r.last_name}`.trim(),
      subtitle: r.eventTitle,
      email: r.email,
      // Guest counts are not money — leave amount empty; show guests in status.
      amount: null,
      status: `${r.guest_count} guest${r.guest_count === 1 ? '' : 's'}`,
      createdAt: r.created_at,
      recordId: r.id,
    });
  }

  return items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
