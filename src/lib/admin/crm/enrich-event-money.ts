import type { EventRegistration, FormSubmission } from '@/types/database';

type Pricing = {
  ticketSubtotal?: number;
  sponsorAmount?: number;
  cardFee?: number;
  total?: number;
  fairChildLines?: unknown;
};

/**
 * When paid-event money columns were missing at insert time, amounts still
 * live on form_submissions.payload.pricing. Copy them onto RSVP rows in memory
 * (and prefer lasting backfill via /api/admin/backfill-event-registration-money).
 */
export function enrichEventRegistrationsFromFormSubmissions(
  rsvps: EventRegistration[],
  submissions: FormSubmission[],
): EventRegistration[] {
  const priced = submissions.filter((s) => {
    if (s.form_type !== 'rsvp') return false;
    const p = s.payload as Record<string, unknown> | null;
    const pricing = p?.pricing as Pricing | undefined;
    return Boolean(pricing && Number(pricing.total) > 0);
  });

  if (!priced.length) return rsvps;

  return rsvps.map((r) => {
    if (Number(r.amount) > 0) return r;
    const email = (r.email || '').trim().toLowerCase();
    const slug = (r.event_slug || '').trim();
    if (!email || !slug) return r;

    const match = priced.find((s) => {
      const p = s.payload as Record<string, unknown>;
      const sEmail = String(s.email || p.email || '')
        .trim()
        .toLowerCase();
      const sSlug = String(p.slug || '').trim();
      return sEmail === email && sSlug === slug;
    });
    if (!match) return r;

    const p = match.payload as Record<string, unknown>;
    const pricing = p.pricing as Pricing;
    const amount = Number(pricing.total) || 0;
    const sponsor = Number(pricing.sponsorAmount) || 0;
    const fee = Number(pricing.cardFee) || 0;
    const ticketSubtotal = Number(pricing.ticketSubtotal) || 0;

    const existingDetails =
      typeof r.registration_details === 'object' && r.registration_details
        ? (r.registration_details as Record<string, unknown>)
        : {};

    return {
      ...r,
      amount,
      sponsor_amount: sponsor,
      card_fee: fee,
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
                : undefined),
        dinner: existingDetails.dinner ?? p.dinner,
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
