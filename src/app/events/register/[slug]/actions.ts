'use server';

import {
  computePaidEventTotal,
  totalToCents,
  type CouplesRegistrationData,
  type DinnerRegistrationData,
  type FairRegistrationData,
  type WomensRegistrationData,
} from '@/lib/events/paid-event-pricing';
import { getPaidEvent } from '@/lib/events/paid-events';
import {
  assertPaidEventHasRoom,
  paidEventUnitsFromInput,
} from '@/lib/events/paid-event-capacity';
import { verifyPaidEventPaymentIntent } from '@/lib/events/verify-event-payment';
import { persistPaidEventRegistration } from '@/lib/events/persist-paid-event-registration';
import {
  verifyHebrewFairCode,
  recordFairCodeRedemptions,
  attachFairCodeRedemptionsToEventRegistration,
  releaseFairCodeRedemptions,
} from '@/lib/events/hebrew-fair-codes';
import {
  verifyHaBayitMemberCode,
  recordMemberCodeRedemption,
  attachMemberCodeRedemptionToEventRegistration,
  releaseMemberCodeRedemption,
} from '@/lib/events/chai-member-event-codes';
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
  donationChoice?: 'none' | 'amount';
  paymentIntentId?: string;
  dinner?: DinnerRegistrationData;
  fair?: FairRegistrationData;
  womens?: WomensRegistrationData;
  couples?: CouplesRegistrationData;
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
  const limited = await enforceActionRateLimit('hebrew-fair-code', 12, 15 * 60 * 1000);
  if (!limited.ok) {
    return { valid: false, reason: limited.error };
  }

  const lookup = await verifyHebrewFairCode(code, { eventSlug });
  if (!lookup.valid) {
    return { valid: false, reason: lookup.reason };
  }
  const childName = [lookup.childFirstName, lookup.childLastName].filter(Boolean).join(' ');
  return { valid: true, childName: childName || undefined };
}

export async function verifyHaBayitMemberCodeAction(
  code: string,
  eventSlug?: string,
): Promise<{ valid: boolean; reason?: string }> {
  const limited = await enforceActionRateLimit('habayit-member-code', 12, 15 * 60 * 1000);
  if (!limited.ok) {
    return { valid: false, reason: limited.error };
  }

  const lookup = await verifyHaBayitMemberCode(code, { eventSlug });
  if (!lookup.valid) return { valid: false, reason: lookup.reason };
  return { valid: true };
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
    const room = await assertPaidEventHasRoom(
      event,
      paidEventUnitsFromInput(event, {
        couples: input.couples,
        dinner: input.dinner,
        fair: input.fair,
        womens: input.womens,
      }),
    );
    if (!room.ok) return { success: false, error: room.error };

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

    if (event.type === 'dinner' || event.type === 'celebration') {
      const adults = input.dinner?.adults ?? 0;
      const kids = input.dinner?.kids ?? 0;
      if (adults + kids < 1) {
        return { success: false, error: 'Please enter at least one adult or child.' };
      }
    }

    if (event.requireDonationChoice) {
      if (input.donationChoice !== 'none' && input.donationChoice !== 'amount') {
        return { success: false, error: 'Please choose a donation amount or None at this time.' };
      }
      if (input.donationChoice === 'amount' && input.sponsorAmount < 1) {
        return {
          success: false,
          error: 'Please enter a donation amount greater than $0, or choose None at this time.',
        };
      }
    }

    if (event.type === 'womens') {
      const women = input.womens?.women ?? 0;
      if (women < 1) {
        return { success: false, error: 'Please enter how many women are attending.' };
      }
    }

    let couplesData = input.couples;
    let memberRedemption: { partnerId: string; code: string } | null = null;
    if (event.type === 'couples') {
      const coupleCount = Math.max(0, Math.round(input.couples?.couples || 0));
      if (coupleCount < 1) {
        return { success: false, error: 'Please add at least one couple.' };
      }
      const rawCode = input.couples?.memberCode?.trim() || '';
      if (rawCode) {
        const lookup = await verifyHaBayitMemberCode(rawCode, { eventSlug: event.slug });
        if (!lookup.valid || !lookup.partnerId || !lookup.code) {
          const reasonMsg =
            lookup.reason === 'already_used'
              ? 'This HaBayit member code was already used for this event.'
              : lookup.reason === 'not_eligible'
                ? 'This HaBayit member code is not active.'
                : 'This HaBayit member code is not valid.';
          return { success: false, error: reasonMsg };
        }
        memberRedemption = { partnerId: lookup.partnerId, code: lookup.code };
        couplesData = {
          couples: coupleCount,
          memberCode: lookup.code,
          memberDiscount: true,
        };
      } else {
        couplesData = { couples: coupleCount, memberDiscount: false };
      }
    }

    const pricing = computePaidEventTotal({
      event,
      dinner: input.dinner,
      fair: input.fair,
      fairFreeChildIndices,
      womens: input.womens,
      couples: couplesData,
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
    if (fairRedemptions.length || memberRedemption) {
      eventId = await ensureEventBySlug(event.slug);
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
      if (memberRedemption) {
        const reservedMember = await recordMemberCodeRedemption({
          eventId,
          eventRegistrationId: null,
          partnerId: memberRedemption.partnerId,
          code: memberRedemption.code,
        });
        if (!reservedMember.ok) {
          return { success: false, error: reservedMember.error };
        }
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
      couples: couplesData,
    });

    if (!result.success) {
      if (fairRedemptions.length && eventId) {
        await releaseFairCodeRedemptions({
          eventId,
          registrationIds: fairRedemptions.map((r) => r.registrationId),
        });
      }
      if (memberRedemption && eventId) {
        await releaseMemberCodeRedemption({
          eventId,
          partnerId: memberRedemption.partnerId,
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
    if (memberRedemption && eventId) {
      await attachMemberCodeRedemptionToEventRegistration({
        eventId,
        eventRegistrationId: result.registrationId,
        partnerId: memberRedemption.partnerId,
      });
    }

    return { success: true, receiptUrl: result.receiptUrl };
  } catch (err) {
    console.error('[paid event] submission error:', err);
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}
