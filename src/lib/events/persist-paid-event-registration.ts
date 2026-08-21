import { logFormSubmission } from '@/lib/admin/form-log';
import { ensureCrmContact } from '@/lib/admin/ensure-contact';
import { findFamilyIdByEmail } from '@/lib/families/lookup';
import { ensureEventBySlug } from '@/lib/events/sync';
import { appendPaidEventRow } from '@/lib/google/sheets';
import { sendPaidEventConfirmationEmail } from '@/lib/email/paid-event-confirmation';
import {
  computePaidEventTotal,
  type DinnerRegistrationData,
  type FairRegistrationData,
  type WomensRegistrationData,
} from '@/lib/events/paid-event-pricing';
import {
  getPaidEvent,
  getPaidEventSheetId,
  type PaidEventConfig,
} from '@/lib/events/paid-events';
import { buildReceiptUrl } from '@/lib/donations/receipt-url';
import { createAdminClient } from '@/lib/supabase/server';
import { insertWithSchemaFallback } from '@/lib/supabase/insert-helpers';
import { normalizeDonorEmail } from '@/lib/donations/normalize-donor';

export type PaidEventPersistInput = {
  slug: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  coverFee: boolean;
  sponsorAmount: number;
  paymentIntentId?: string | null;
  dinner?: DinnerRegistrationData;
  fair?: FairRegistrationData;
  womens?: WomensRegistrationData;
  /** Skip confirmation email (e.g. when recovering duplicates). */
  skipEmail?: boolean;
  /** Skip Google Sheet append. */
  skipSheet?: boolean;
};

export type PaidEventPersistResult =
  | {
      success: true;
      registrationId: string;
      receiptUrl?: string;
      alreadyExisted?: boolean;
    }
  | { success: false; error: string };

function buildDetailsSummary(
  event: PaidEventConfig,
  dinner?: DinnerRegistrationData,
  fair?: FairRegistrationData,
  womens?: WomensRegistrationData,
  fairLines?: ReturnType<typeof computePaidEventTotal>['fairChildLines'],
): string {
  if (event.type === 'dinner' && dinner) {
    return `Adults: ${dinner.adults}\nChildren (12 & under): ${dinner.kids}`;
  }
  if (event.type === 'family-fair' && fair) {
    const lines =
      fairLines?.map(
        (l) =>
          `Child ${l.index}: ${l.free ? 'HaBayit Hebrew (free)' : `$${l.price}`}${l.codeUsed ? ` — code ${l.codeUsed}` : ''}`,
      ) ?? [];
    return `Children: ${fair.children.length}\n${lines.join('\n')}`;
  }
  if (event.type === 'womens' && womens) {
    return `Women attending: ${womens.women}`;
  }
  return '';
}

/**
 * Idempotent paid-event registration write.
 * Safe to call from the form submit path and from Stripe webhooks.
 */
export async function persistPaidEventRegistration(
  input: PaidEventPersistInput,
): Promise<PaidEventPersistResult> {
  const event = getPaidEvent(input.slug);
  if (!event) return { success: false, error: 'Event not found.' };

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = normalizeDonorEmail(input.email);
  const phone = input.phone.trim();
  const paymentIntentId = input.paymentIntentId?.trim() || null;

  if (!firstName || !lastName || !email) {
    return { success: false, error: 'Name and email are required.' };
  }

  const supabase = createAdminClient();

  // Idempotency: never create a second row for the same Stripe payment.
  if (paymentIntentId) {
    const { data: existing, error: existingErr } = await supabase
      .from('event_registrations')
      .select('id')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .maybeSingle();

    if (!existingErr && existing?.id) {
      const pricingExisting = computePaidEventTotal({
        event,
        dinner: input.dinner,
        fair: input.fair,
        womens: input.womens,
        sponsorAmount: input.sponsorAmount,
        coverFee: input.coverFee,
      });
      const receiptUrl =
        pricingExisting.total > 0
          ? buildReceiptUrl({
              name: `${firstName} ${lastName}`,
              amount: pricingExisting.total,
              memo: event.title,
              campaign: event.slug,
            })
          : undefined;
      return {
        success: true,
        registrationId: existing.id,
        receiptUrl,
        alreadyExisted: true,
      };
    }
  }

  const pricing = computePaidEventTotal({
    event,
    dinner: input.dinner,
    fair: input.fair,
    womens: input.womens,
    sponsorAmount: input.sponsorAmount,
    coverFee: input.coverFee,
  });

  const eventId = await ensureEventBySlug(event.slug);
  if (!eventId) {
    return { success: false, error: 'Could not save registration. Please contact us.' };
  }

  const detailsSummary = buildDetailsSummary(
    event,
    input.dinner,
    input.fair,
    input.womens,
    pricing.fairChildLines,
  );

  const guestCount =
    event.type === 'dinner'
      ? (input.dinner?.adults ?? 0) + (input.dinner?.kids ?? 0)
      : event.type === 'family-fair'
        ? (input.fair?.children.length ?? 0)
        : (input.womens?.women ?? 1);

  const familyId = await findFamilyIdByEmail(email);

  const registrationDetails = {
    type: event.type,
    dinner: input.dinner,
    fair: input.fair,
    womens: input.womens,
    fairChildLines: pricing.fairChildLines,
    ticketSubtotal: pricing.ticketSubtotal,
    coverFee: input.coverFee,
  };

  const row: Record<string, unknown> = {
    event_id: eventId,
    event_slug: event.slug,
    family_id: familyId,
    first_name: firstName,
    last_name: lastName,
    email,
    phone: phone || null,
    guest_count: Math.max(1, guestCount),
    notes: detailsSummary || null,
    amount: pricing.total,
    sponsor_amount: pricing.sponsorAmount,
    card_fee: pricing.cardFee,
    stripe_payment_intent_id: paymentIntentId,
    registration_details: registrationDetails,
  };

  // IMPORTANT: select only columns that always exist. Selecting `amount` when
  // migration 0012 is missing causes the whole insert to fail after fallback strips it.
  const regResult = await insertWithSchemaFallback(row, async (payload) =>
    supabase.from('event_registrations').insert(payload).select('id').single(),
  );

  if (regResult.error || !regResult.data) {
    // Race: another request may have inserted the same PI while we were writing.
    if (paymentIntentId) {
      const { data: raced } = await supabase
        .from('event_registrations')
        .select('id')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .maybeSingle();
      if (raced?.id) {
        return {
          success: true,
          registrationId: raced.id,
          alreadyExisted: true,
          receiptUrl:
            pricing.total > 0
              ? buildReceiptUrl({
                  name: `${firstName} ${lastName}`,
                  amount: pricing.total,
                  memo: event.title,
                  campaign: event.slug,
                })
              : undefined,
        };
      }
    }

    console.error('[paid event] insert error:', regResult.error);
    return { success: false, error: 'Could not save registration. Please try again.' };
  }

  const registrationId = (regResult.data as { id: string }).id;

  await logFormSubmission({
    formType: 'rsvp',
    email,
    sourceId: registrationId,
    payload: {
      slug: event.slug,
      eventTitle: event.title,
      firstName,
      lastName,
      email,
      phone,
      coverFee: input.coverFee,
      sponsorAmount: input.sponsorAmount,
      paymentIntentId,
      dinner: input.dinner,
      fair: input.fair,
      womens: input.womens,
      pricing,
      recovered: false,
    },
  });

  await ensureCrmContact({
    firstName,
    lastName,
    email,
    phone,
    interest: event.title,
    note: `--- ${event.title} ---\n${detailsSummary}\nTotal: $${pricing.total.toFixed(2)}`,
    isResolved: true,
  });

  // Best-effort payments ledger row
  if (paymentIntentId && pricing.total > 0) {
    try {
      const { data: existingPay } = await supabase
        .from('payments')
        .select('id')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .maybeSingle();
      if (!existingPay) {
        await supabase.from('payments').insert({
          source_type: 'event_registration',
          source_id: registrationId,
          amount: pricing.total,
          stripe_payment_intent_id: paymentIntentId,
          status: 'succeeded',
          paid_at: new Date().toISOString(),
        });
      }
    } catch (payErr) {
      console.error('[paid event] payments ledger insert failed:', payErr);
    }
  }

  if (!input.skipSheet) {
    const sheetId = getPaidEventSheetId(event);
    if (sheetId) {
      const timestamp = new Date().toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

      let sheetValues: (string | number)[];
      if (event.type === 'dinner') {
        sheetValues = [
          timestamp,
          lastName,
          firstName,
          email,
          phone,
          input.dinner?.adults ?? 0,
          input.dinner?.kids ?? 0,
          `$${pricing.ticketSubtotal.toFixed(2)}`,
          pricing.sponsorAmount > 0 ? `$${pricing.sponsorAmount.toFixed(2)}` : '',
          pricing.cardFee > 0 ? `$${pricing.cardFee.toFixed(2)}` : '',
          `$${pricing.total.toFixed(2)}`,
          paymentIntentId ?? '',
        ];
      } else if (event.type === 'family-fair') {
        const childDetails =
          pricing.fairChildLines
            ?.map(
              (l) =>
                `#${l.index}: ${l.free ? 'HaBayit Hebrew (free)' : `$${l.price}`}${l.codeUsed ? ` [${l.codeUsed}]` : ''}`,
            )
            .join('; ') ?? '';
        sheetValues = [
          timestamp,
          lastName,
          firstName,
          email,
          phone,
          input.fair?.children.length ?? 0,
          childDetails,
          `$${pricing.ticketSubtotal.toFixed(2)}`,
          pricing.sponsorAmount > 0 ? `$${pricing.sponsorAmount.toFixed(2)}` : '',
          pricing.cardFee > 0 ? `$${pricing.cardFee.toFixed(2)}` : '',
          `$${pricing.total.toFixed(2)}`,
          paymentIntentId ?? '',
        ];
      } else {
        sheetValues = [
          timestamp,
          lastName,
          firstName,
          email,
          phone,
          input.womens?.women ?? 0,
          `$${pricing.ticketSubtotal.toFixed(2)}`,
          pricing.sponsorAmount > 0 ? `$${pricing.sponsorAmount.toFixed(2)}` : '',
          pricing.cardFee > 0 ? `$${pricing.cardFee.toFixed(2)}` : '',
          `$${pricing.total.toFixed(2)}`,
          paymentIntentId ?? '',
        ];
      }

      try {
        await appendPaidEventRow(sheetId, event.type, sheetValues);
      } catch (sheetErr) {
        console.error('[paid event] Sheets append failed:', sheetErr);
      }
    }
  }

  const receiptUrl =
    pricing.total > 0
      ? buildReceiptUrl({
          name: `${firstName} ${lastName}`,
          amount: pricing.total,
          memo: event.title,
          campaign: event.slug,
        })
      : undefined;

  if (!input.skipEmail) {
    try {
      await sendPaidEventConfirmationEmail({
        event,
        firstName,
        lastName,
        email,
        phone,
        pricing,
        detailsSummary,
        receiptUrl,
      });
    } catch (emailErr) {
      console.error('[paid event] email failed:', emailErr);
    }
  }

  return { success: true, registrationId, receiptUrl };
}

/** Rebuild persist input from Stripe PaymentIntent metadata. */
export function paidEventInputFromPaymentIntentMetadata(
  meta: Record<string, string>,
  paymentIntentId: string,
): PaidEventPersistInput | null {
  const slug = meta.event_slug?.trim();
  if (!slug || meta.type !== 'paid_event_registration') return null;

  const email = meta.donor_email?.trim();
  const donorName = meta.donor_name?.trim() || '';
  const parts = donorName.split(/\s+/);
  const firstName = meta.first_name?.trim() || parts[0] || '';
  const lastName = meta.last_name?.trim() || parts.slice(1).join(' ') || '';
  if (!email || !firstName) return null;

  const women = Number(meta.women || meta.guest_count || 1);
  const adults = Number(meta.adults || 0);
  const kids = Number(meta.kids || 0);
  const fairChildren = Number(meta.fair_children || 0);

  const event = getPaidEvent(slug);
  if (!event) return null;

  return {
    slug,
    firstName,
    lastName,
    email,
    phone: meta.phone?.trim() || '',
    coverFee: meta.cover_fee === '1' || meta.cover_fee === 'true',
    sponsorAmount: Number(meta.sponsor_amount || 0) || 0,
    paymentIntentId,
    dinner:
      event.type === 'dinner'
        ? { adults: Math.max(0, adults), kids: Math.max(0, kids) }
        : undefined,
    fair:
      event.type === 'family-fair'
        ? {
            children: Array.from({ length: Math.max(1, fairChildren) }, () => ({
              hebrewCode: '',
            })),
          }
        : undefined,
    womens: event.type === 'womens' ? { women: Math.max(1, women) } : undefined,
  };
}
