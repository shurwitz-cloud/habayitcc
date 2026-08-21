'use server';

import {
  computePaidEventTotal,
  totalToCents,
  type DinnerRegistrationData,
  type FairRegistrationData,
  type WomensRegistrationData,
} from '@/lib/events/paid-event-pricing';
import { getPaidEvent } from '@/lib/events/paid-events';
import { verifyPaidEventPaymentIntent } from '@/lib/events/verify-event-payment';
import { persistPaidEventRegistration } from '@/lib/events/persist-paid-event-registration';
import {
  verifyHebrewFairCode,
  recordFairCodeRedemptions,
  attachFairCodeRedemptionsToEventRegistration,
  releaseFairCodeRedemptions,
} from '@/lib/events/hebrew-fair-codes';
import { ensureEventBySlug } from '@/lib/events/sync';
import { enforceActionRateLimit } from '@/lib/security/action-rate-limit';
import { assertSupabaseWriteReady } from '@/lib/supabase/require-write';

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
  eventSlug?: string,
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

export async function submitPaidEventRegistration(
  input: PaidEventRegistrationInput,
): Promise<PaidEventRegistrationResult> {
  const limited = await enforceActionRateLimit('paid-event-register', 20, 15 * 60 * 1000);
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
        totalCents,
      );
      if (!verified.ok) return { success: false, error: verified.error };
    }

    let eventId: string | null = null;
    if (fairRedemptions.length) {
      eventId = await ensureEventBySlug(event.slug);
      if (!eventId) {
        return { success: false, error: 'Could not save registration. Please contact us.' };
      }
      const reserved = await recordFairCodeRedemptions({
        eventId,
        eventRegistrationId: null,
        items: fairRedemptions,
      });
      if (!reserved.ok) {
        return { success: false, error: reserved.error };
      }
    }

    const result = await persistPaidEventRegistration({
      slug: event.slug,
      firstName,
      lastName,
      email,
      phone,
      coverFee: input.coverFee,
      sponsorAmount: input.sponsorAmount,
      paymentIntentId: input.paymentIntentId,
      dinner: input.dinner,
      fair: input.fair,
      womens: input.womens,
    });

    if (!result.success) {
      if (fairRedemptions.length && eventId) {
        await releaseFairCodeRedemptions({
          eventId,
          registrationIds: fairRedemptions.map((r) => r.registrationId),
        });
      }
      return { success: false, error: result.error };
    }

    if (fairRedemptions.length && eventId) {
      await attachFairCodeRedemptionsToEventRegistration({
        eventId,
        eventRegistrationId: result.registrationId,
        registrationIds: fairRedemptions.map((r) => r.registrationId),
      });
    }

    return { success: true, receiptUrl: result.receiptUrl };
  } catch (err) {
    console.error('[paid event] submission error:', err);
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}
