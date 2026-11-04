'use server';

import {
  computePaidEventTotal,
  totalToCents,
  type CouplesRegistrationData,
  type DinnerRegistrationData,
  type FairRegistrationData,
  type SkateRegistrationData,
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
  verifySkateMemberCode,
  recordMemberCodeRedemption,
  attachMemberCodeRedemptionToEventRegistration,
  releaseMemberCodeRedemption,
  type SkateMemberLookup,
} from '@/lib/events/chai-member-event-codes';
import { getHeldSkateAllowance, releaseSkateAllowance } from '@/lib/events/skate-allowance';
import {
  bindHebrewFairCodePayment,
  claimHebrewFairCodeHold,
  getHeldHebrewFairCodeClaims,
  reconcileExpiredHebrewFairCodeHolds,
  releaseHebrewFairCodeHolds,
} from '@/lib/events/hebrew-fair-code-holds';
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
  skate?: SkateRegistrationData;
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

function skateMemberCodeError(lookup: SkateMemberLookup): string {
  if (lookup.reason === 'identity_mismatch') {
    return 'This Chai code does not match these details. Correct the name, email or phone, or continue without the code at full price.';
  }
  if (lookup.reason === 'exhausted') {
    return 'This Chai member already used all 6 discounted skaters for this event.';
  }
  if (lookup.reason === 'unverified') {
    return 'We could not verify your Chai code right now. Please try again in a moment, or continue without the code at full price.';
  }
  return 'This HaBayit member code is not valid or not active.';
}

export async function verifyHaBayitMemberCodeAction(
  code: string,
  eventSlug?: string,
  identity?: { firstName?: string; lastName?: string; email?: string; phone?: string },
): Promise<{ valid: boolean; reason?: string; remainingSkaters?: number }> {
  const limited = await enforceActionRateLimit('habayit-member-code', 12, 15 * 60 * 1000);
  if (!limited.ok) {
    return { valid: false, reason: limited.error };
  }

  const event = eventSlug ? getPaidEvent(eventSlug) : null;
  if (event?.type === 'skate') {
    const lookup = await verifySkateMemberCode(code, {
      eventSlug: event.slug,
      ...identity,
    });
    if (!lookup.valid) return { valid: false, reason: skateMemberCodeError(lookup) };
    return { valid: true, remainingSkaters: lookup.remaining };
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
        skate: input.skate,
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
    let skateData = input.skate;
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

    if (event.type === 'skate') {
      const skaterCount = Math.max(0, Math.round(input.skate?.skaters || 0));
      if (skaterCount < 1) {
        return { success: false, error: 'Please add at least one skater.' };
      }
      const rawCode = input.skate?.memberCode?.trim() || '';
      if (rawCode) {
        // A checkout that claimed its allowance before being charged is
        // never rejected afterwards: its held reservation rows are the
        // discount proof (migration 0028). Falls back to re-verifying
        // the code when reservations are not live.
        const held = input.paymentIntentId
          ? await getHeldSkateAllowance(input.paymentIntentId)
          : null;
        if (held && held.count > 0) {
          memberRedemption = { partnerId: held.partnerId, code: held.code };
          skateData = {
            skaters: skaterCount,
            memberCode: held.code,
            memberDiscount: true,
            memberSkaters: held.count,
          };
        } else if (held && held.count === 0) {
          // Claimed rows missing for a charged PI: keep the member safe -
          // re-verify rather than reject a paid registration.
          const lookup = await verifySkateMemberCode(rawCode, {
            eventSlug: event.slug,
            firstName,
            lastName,
            email,
            phone,
          });
          if (!lookup.valid || !lookup.partnerId || !lookup.code) {
            console.error('[paid event] paid PI without held allowance or valid code:', input.paymentIntentId);
            return { success: false, error: skateMemberCodeError(lookup) };
          }
          memberRedemption = { partnerId: lookup.partnerId, code: lookup.code };
          skateData = {
            skaters: skaterCount,
            memberCode: lookup.code,
            memberDiscount: true,
            memberSkaters: lookup.remaining,
          };
        } else {
          const lookup = await verifySkateMemberCode(rawCode, {
            eventSlug: event.slug,
            firstName,
            lastName,
            email,
            phone,
          });
          if (!lookup.valid || !lookup.partnerId || !lookup.code) {
            return { success: false, error: skateMemberCodeError(lookup) };
          }
          memberRedemption = { partnerId: lookup.partnerId, code: lookup.code };
          skateData = {
            skaters: skaterCount,
            memberCode: lookup.code,
            memberDiscount: true,
            memberSkaters: lookup.remaining,
          };
        }
      } else {
        skateData = { skaters: skaterCount, memberDiscount: false };
      }

      // Hebrew Adventure codes: 3% off one skater per code. Discounts
      // never stack: when a Chai member discount is applied to this
      // registration, HA codes are IGNORED entirely (the larger discount
      // wins for the whole registration, even beyond the member cap) and
      // are never claimed or consumed. A checkout that claimed its codes
      // before being charged is never rejected afterwards: its held
      // rows (bound to the payment intent, migration 0030) are the
      // discount proof. When no holds are bound (e.g. a retried paid
      // checkout whose holds were released), the codes are re-claimed
      // through the SAME atomic hold path and bound to the existing
      // payment intent - never a racy check-then-insert.
      const rawHaCodes = (input.skate?.haCodes ?? [])
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean);
      if (rawHaCodes.length && skateData?.memberDiscount !== true) {
        if (new Set(rawHaCodes).size !== rawHaCodes.length) {
          return {
            success: false,
            error: 'Each Hebrew Adventure code can only discount one skater on this registration.',
          };
        }
        const codesToApply = rawHaCodes.slice(0, skaterCount);
        if (codesToApply.length) {
          if (!input.paymentIntentId) {
            return { success: false, error: 'Payment is required to complete registration.' };
          }
          const held = await getHeldHebrewFairCodeClaims(input.paymentIntentId);
          if (held === null) {
            // Holds unsupported (migration 0030 missing): fail closed,
            // never fall back to a racy redemption write.
            return {
              success: false,
              error:
                'We could not verify your Hebrew Adventure code right now. Please try again in a moment, or continue without the code at full price.',
            };
          }
          if (held.count > 0) {
            skateData = {
              ...skateData,
              skaters: skaterCount,
              haCodes: held.items.map((item) => item.code),
              haDiscountedSkaters: held.count,
            };
          } else {
            const haEventId = await ensureEventBySlug(event.slug);
            if (!haEventId) {
              return { success: false, error: 'Could not save registration. Please contact us.' };
            }
            const token = crypto.randomUUID();
            const claimed: Array<{ registrationId: string; code: string }> = [];
            const failHa = async (message: string) => {
              await releaseHebrewFairCodeHolds({ claimToken: token });
              return { success: false as const, error: message };
            };
            for (const code of codesToApply) {
              const lookup = await verifyHebrewFairCode(code, { eventSlug: event.slug });
              if (!lookup.valid || !lookup.registrationId) {
                const reasonMsg =
                  lookup.reason === 'already_used'
                    ? 'This Hebrew Adventure code was already used for this event.'
                    : lookup.reason === 'not_eligible'
                      ? 'This Hebrew Adventure code is not active.'
                      : 'This Hebrew Adventure code is not valid.';
                return await failHa(reasonMsg);
              }
              const reconcile = await reconcileExpiredHebrewFairCodeHolds({
                eventId: haEventId,
                registrationId: lookup.registrationId,
              });
              if (!reconcile.supported || reconcile.failures > 0) {
                return await failHa(
                  'We could not verify your Hebrew Adventure code right now. Please try again in a moment, or continue without the code at full price.',
                );
              }
              const claim = await claimHebrewFairCodeHold({
                eventId: haEventId,
                registrationId: lookup.registrationId,
                code: lookup.code ?? code,
                claimToken: token,
              });
              if (!claim.supported || claim.error) {
                return await failHa(
                  'We could not verify your Hebrew Adventure code right now. Please try again in a moment, or continue without the code at full price.',
                );
              }
              if (!claim.claimed) {
                return await failHa('This Hebrew Adventure code was already used for this event.');
              }
              claimed.push({ registrationId: lookup.registrationId, code: lookup.code ?? code });
            }
            // Bind the late claim to the existing payment so persist
            // consumes it (and a persist failure can release it).
            await bindHebrewFairCodePayment(token, input.paymentIntentId);
            skateData = {
              ...skateData,
              skaters: skaterCount,
              haCodes: claimed.map((item) => item.code),
              haDiscountedSkaters: claimed.length,
            };
          }
        }
      }
    }

    const pricing = computePaidEventTotal({
      event,
      dinner: input.dinner,
      fair: input.fair,
      fairFreeChildIndices,
      womens: input.womens,
      couples: couplesData,
      skate: skateData,
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
          allowReuse: event.type === 'skate',
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
      skate: skateData,
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
      if (event.type === 'skate' && input.paymentIntentId) {
        await releaseSkateAllowance({ paymentIntentId: input.paymentIntentId });
        // HA holds bound to this PI are deliberately NOT released here:
        // payment was verified succeeded BEFORE persist ran, so this
        // checkout was already charged - freeing its codes would let
        // another checkout take them and make the paid retry fail
        // (pay-then-reject). The retry finds the held rows as its
        // discount proof; if the user never retries, the expired hold
        // is reconciled against Stripe (succeeded PI -> consumed +
        // logged for admin recovery), never freed by time alone.
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
