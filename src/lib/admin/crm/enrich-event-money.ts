import type { EventRegistration, FormSubmission } from '@/types/database';

type Pricing = {
  ticketSubtotal?: number;
  sponsorAmount?: number;
  cardFee?: number;
  total?: number;
  fairChildLines?: unknown;
};

function dinnerLooksEmpty(dinner: unknown): boolean {
  if (!dinner || typeof dinner !== 'object') return true;
  const d = dinner as { adults?: unknown; kids?: unknown };
  const adults = Number(d.adults);
  const kids = Number(d.kids);
  return !(
    (Number.isFinite(adults) && adults > 0) ||
    (Number.isFinite(kids) && kids > 0)
  );
}

/**
 * When paid-event columns were missing at insert time, amounts + dinner/kids
 * still live on form_submissions.payload. Copy them onto RSVP rows in memory
 * (and prefer lasting backfill via /api/admin/backfill-event-registration-money
 * or /api/admin/backfill-event-adults-kids).
 */
export function enrichEventRegistrationsFromFormSubmissions(
  rsvps: EventRegistration[],
  submissions: FormSubmission[],
): EventRegistration[] {
  const rsvpSubs = submissions.filter((s) => s.form_type === 'rsvp');
  if (!rsvpSubs.length) return rsvps;

  return rsvps.map((r) => {
    const email = (r.email || '').trim().toLowerCase();
    const slug = (r.event_slug || '').trim();
    if (!email || !slug) return r;

    const existingDetails =
      typeof r.registration_details === 'object' && r.registration_details
        ? (r.registration_details as Record<string, unknown>)
        : {};
    const needsMoney = !(Number(r.amount) > 0);
    const needsDinner = dinnerLooksEmpty(existingDetails.dinner);
    if (!needsMoney && !needsDinner) return r;

    const match = rsvpSubs.find((s) => {
      const p = s.payload as Record<string, unknown>;
      const sEmail = String(s.email || p.email || '')
        .trim()
        .toLowerCase();
      const sSlug = String(p.slug || '').trim();
      return sEmail === email && sSlug === slug;
    });
    if (!match) return r;

    const p = match.payload as Record<string, unknown>;
    const pricing = (p.pricing as Pricing | undefined) ?? {};
    const amount = Number(pricing.total) || 0;
    const sponsor = Number(pricing.sponsorAmount) || 0;
    const fee = Number(pricing.cardFee) || 0;
    const ticketSubtotal = Number(pricing.ticketSubtotal) || 0;
    const dinnerFromPayload = p.dinner;

    return {
      ...r,
      amount: needsMoney && amount > 0 ? amount : r.amount,
      sponsor_amount: needsMoney && amount > 0 ? sponsor : r.sponsor_amount,
      card_fee: needsMoney && amount > 0 ? fee : r.card_fee,
      stripe_payment_intent_id:
        r.stripe_payment_intent_id ||
        (typeof p.paymentIntentId === 'string' ? p.paymentIntentId : null),
      registration_details: {
        ...existingDetails,
        type:
          existingDetails.type ||
          (slug.includes('dinner')
            ? 'dinner'
            : slug.includes('fair')
              ? 'family-fair'
              : slug.includes('womens')
                ? 'womens'
                : slug.includes('simchat')
                  ? 'celebration'
                  : undefined),
        dinner:
          needsDinner && !dinnerLooksEmpty(dinnerFromPayload)
            ? dinnerFromPayload
            : existingDetails.dinner ?? dinnerFromPayload,
        fair: existingDetails.fair ?? p.fair,
        womens: existingDetails.womens ?? p.womens,
        fairChildLines: existingDetails.fairChildLines ?? pricing.fairChildLines,
        ticketSubtotal:
          existingDetails.ticketSubtotal != null
            ? existingDetails.ticketSubtotal
            : ticketSubtotal,
        coverFee:
          existingDetails.coverFee != null
            ? existingDetails.coverFee
            : Boolean(p.coverFee),
      },
    };
  });
}
