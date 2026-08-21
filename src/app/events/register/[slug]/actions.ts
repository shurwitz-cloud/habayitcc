'use server';

import { logFormSubmission } from '@/lib/admin/form-log';
import { findFamilyIdByEmail } from '@/lib/families/lookup';
import { ensureEventBySlug } from '@/lib/events/sync';
import { appendPaidEventRow } from '@/lib/google/sheets';
import { sendPaidEventConfirmationEmail } from '@/lib/email/paid-event-confirmation';
import { verifyHebrewFairCode, recordFairCodeRedemptions, attachFairCodeRedemptionsToEventRegistration, releaseFairCodeRedemptions } from '@/lib/events/hebrew-fair-codes';
import {
  computePaidEventTotal,
  totalToCents,
  type DinnerRegistrationData,
  type FairRegistrationData,
  type WomensRegistrationData,
} from '@/lib/events/paid-event-pricing';
import { getPaidEvent, getPaidEventSheetId } from '@/lib/events/paid-events';
import { verifyPaidEventPaymentIntent } from '@/lib/events/verify-event-payment';
import { ensureCrmContact } from '@/lib/admin/ensure-contact';
import { enforceActionRateLimit } from '@/lib/security/action-rate-limit';
import { createAdminClient } from '@/lib/supabase/server';
import { assertSupabaseWriteReady } from '@/lib/supabase/require-write';
import { insertWithSchemaFallback } from '@/lib/supabase/insert-helpers';
import { buildReceiptUrl } from '@/lib/donations/receipt-url';

export interface PaidEventRegistrationInput {
  slug: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  coverFee: boolean;
  sponsorAmount: number;
  paymentIntentId?: string;
  dinner?: DinnerRegistrationData;
  fair?: FairRegistrationData;
  womens?: WomensRegistrationData;
}

export interface PaidEventRegistrationResult {
  success: boolean;
  error?: string;
  receiptUrl?: string;
}

export async function verifyHebrewFairCodeAction(
  code: string,
  eventSlug?: string
): Promise<{
  valid: boolean;
  childName?: string;
  reason?: string;
}> {
  const lookup = await verifyHebrewFairCode(code, { eventSlug });
  if (!lookup.valid) {
    return { valid: false, reason: lookup.reason };
  }
  const childName = [lookup.childFirstName, lookup.childLastName].filter(Boolean).join(' ');
  return { valid: true, childName: childName || undefined };
}

function eventAllowsHebrewKidsFree(event: { type: string; hebrewKidsFreeWithCode?: boolean }) {
  return event.hebrewKidsFreeWithCode === true || event.type === 'family-fair';
}

function buildDetailsSummary(
  slug: string,
  dinner?: DinnerRegistrationData,
  fair?: FairRegistrationData,
  womens?: WomensRegistrationData,
  fairLines?: ReturnType<typeof computePaidEventTotal>['fairChildLines']
): string {
  if (slug === 'rosh-hashana-dinner' && dinner) {
    return `Adults: ${dinner.adults}\nChildren (12 & under): ${dinner.kids}`;
  }
  if (slug === 'rosh-hashana-family-fair' && fair) {
    const lines =
      fairLines?.map(
        (l) =>
          `Child ${l.index}: ${l.free ? 'HaBayit Hebrew (free)' : `$${l.price}`}${l.codeUsed ? ` — code ${l.codeUsed}` : ''}`
      ) ?? [];
    return `Children: ${fair.children.length}\n${lines.join('\n')}`;
  }
  if (slug === 'pre-rosh-hashana-womens' && womens) {
    return `Women attending: ${womens.women}`;
  }
  return '';
}

export async function submitPaidEventRegistration(
  input: PaidEventRegistrationInput
): Promise<PaidEventRegistrationResult> {
  const limited = await enforceActionRateLimit('paid-event-register', 10, 15 * 60 * 1000);
  if (!limited.ok) return { success: false, error: limited.error };

  const ready = assertSupabaseWriteReady();
  if (!ready.ok) return { success: false, error: ready.error };

  try {
    const event = getPaidEvent(input.slug);
    if (!event) return { success: false, error: 'Event not found.' };

    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const email = input.email.trim().toLowerCase();
    const phone = input.phone.trim();

    if (!firstName || !lastName || !email || !phone) {
      return { success: false, error: 'Please fill in all required fields.' };
    }

    const fairFreeChildIndices = new Set<number>();
    const fairRedemptions: Array<{ registrationId: string; code: string }> = [];
    const seenCodes = new Set<string>();

    if (eventAllowsHebrewKidsFree(event)) {
      const children = input.fair?.children ?? [];
      if (event.type === 'family-fair' && children.length < 1) {
        return { success: false, error: 'Please add at least one child (ages 3–10).' };
      }
      for (let i = 0; i < children.length; i++) {
        const code = children[i]?.hebrewCode?.trim();
        if (!code) continue;
        const normalized = code.toUpperCase();
        if (seenCodes.has(normalized)) {
          return {
            success: false,
            error: `Each Hebrew code can only free one child. Code for child ${i + 1} was already used in this registration.`,
          };
        }
        seenCodes.add(normalized);

        const lookup = await verifyHebrewFairCode(code, { eventSlug: event.slug });
        if (!lookup.valid || !lookup.registrationId) {
          const reasonMsg =
            lookup.reason === 'already_used'
              ? `HaBayit Hebrew code for child ${i + 1} was already used for this event.`
              : lookup.reason === 'not_eligible'
                ? `HaBayit Hebrew code for child ${i + 1} is not active yet.`
                : `HaBayit Hebrew code for child ${i + 1} is not valid.`;
          return { success: false, error: reasonMsg };
        }
        fairFreeChildIndices.add(i);
        fairRedemptions.push({
          registrationId: lookup.registrationId,
          code: lookup.code ?? normalized,
        });
      }
    } else if (event.type === 'family-fair') {
      const children = input.fair?.children ?? [];
      if (children.length < 1) {
        return { success: false, error: 'Please add at least one child (ages 3–10).' };
      }
    }

    if (event.type === 'dinner') {
      const adults = input.dinner?.adults ?? 0;
      const kids = input.dinner?.kids ?? 0;
      if (adults + kids < 1) {
        return { success: false, error: 'Please enter at least one adult or child.' };
      }
    }

    if (event.type === 'womens') {
      const women = input.womens?.women ?? 0;
      if (women < 1) {
        return { success: false, error: 'Please enter how many women are attending.' };
      }
    }

    const pricing = computePaidEventTotal({
      event,
      dinner: input.dinner,
      fair: input.fair,
      fairFreeChildIndices,
      womens: input.womens,
      sponsorAmount: input.sponsorAmount,
      coverFee: input.coverFee,
    });

    const totalCents = totalToCents(pricing.total);

    if (totalCents > 0) {
      if (!input.paymentIntentId) {
        return { success: false, error: 'Payment is required to complete registration.' };
      }
      const verified = await verifyPaidEventPaymentIntent(
        input.paymentIntentId,
        event.slug,
        totalCents
      );
      if (!verified.ok) return { success: false, error: verified.error };
    }

    await logFormSubmission({
      formType: 'rsvp',
      email,
      payload: { ...input, eventTitle: event.title, pricing },
    });

    const eventId = await ensureEventBySlug(event.slug);
    if (!eventId) {
      return { success: false, error: 'Could not save registration. Please contact us.' };
    }

    if (fairRedemptions.length) {
      const reserved = await recordFairCodeRedemptions({
        eventId,
        eventRegistrationId: null,
        items: fairRedemptions,
      });
      if (!reserved.ok) {
        return { success: false, error: reserved.error };
      }
    }

    const detailsSummary = buildDetailsSummary(
      event.slug,
      input.dinner,
      input.fair,
      input.womens,
      pricing.fairChildLines
    );

    const guestCount =
      event.type === 'dinner'
        ? (input.dinner?.adults ?? 0) + (input.dinner?.kids ?? 0)
        : event.type === 'family-fair'
          ? input.fair?.children.length ?? 0
          : input.womens?.women ?? 1;

    const supabase = createAdminClient();
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

    const row = {
      event_id: eventId,
      event_slug: event.slug,
      family_id: familyId,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      guest_count: guestCount,
      notes: detailsSummary,
      amount: pricing.total,
      sponsor_amount: pricing.sponsorAmount,
      card_fee: pricing.cardFee,
      stripe_payment_intent_id: input.paymentIntentId ?? null,
      registration_details: registrationDetails,
    };

    const regResult = await insertWithSchemaFallback(row, async (payload) =>
      supabase.from('event_registrations').insert(payload).select('id, amount').single()
    );

    if (regResult.error || !regResult.data) {
      if (fairRedemptions.length) {
        await releaseFairCodeRedemptions({
          eventId,
          registrationIds: fairRedemptions.map((r) => r.registrationId),
        });
      }
      console.error('[paid event] insert error:', regResult.error);
      return { success: false, error: 'Could not save registration. Please try again.' };
    }

    const eventRegistrationId = (regResult.data as { id: string }).id;

    if (fairRedemptions.length) {
      await attachFairCodeRedemptionsToEventRegistration({
        eventId,
        eventRegistrationId,
        registrationIds: fairRedemptions.map((r) => r.registrationId),
      });
    }

    // Paid events must persist amount — schema-fallback must not silently drop money columns.
    if (pricing.total > 0 && !(Number((regResult.data as { amount?: number }).amount) > 0)) {
      console.error(
        '[paid event] registration saved without amount — run migration 0012_paid_event_registrations.sql',
        { id: eventRegistrationId, expected: pricing.total }
      );
    }

    await ensureCrmContact({
      firstName,
      lastName,
      email,
      phone,
      interest: event.title,
      note: `--- ${event.title} ---\n${detailsSummary}\nTotal: $${pricing.total.toFixed(2)}`,
      isResolved: true,
    });

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
          input.paymentIntentId ?? '',
        ];
      } else if (event.type === 'family-fair') {
        const childDetails =
          pricing.fairChildLines
            ?.map(
              (l) =>
                `#${l.index}: ${l.free ? 'HaBayit Hebrew (free)' : `$${l.price}`}${l.codeUsed ? ` [${l.codeUsed}]` : ''}`
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
          input.paymentIntentId ?? '',
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
          input.paymentIntentId ?? '',
        ];
      }

      try {
        await appendPaidEventRow(sheetId, event.type, sheetValues);
      } catch (sheetErr) {
        console.error('[paid event] Sheets append failed:', sheetErr);
      }
    } else {
      console.error(`[paid event] No sheet ID for ${event.slug}`);
    }

    let receiptUrl: string | undefined;
    if (pricing.total > 0 && input.paymentIntentId) {
      receiptUrl = buildReceiptUrl({
        name: `${firstName} ${lastName}`,
        amount: pricing.total,
        memo: event.title,
        campaign: event.slug,
      });
    }

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

    return { success: true, receiptUrl };
  } catch (err) {
    console.error('[paid event] submission error:', err);
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}
