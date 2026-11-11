'use server';

import { cookies } from 'next/headers';
import {
  computePaidEventTotal,
  totalToCents,
  type BbqRegistrationData,
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
  reconcileOwnHebrewFairCodeHolds,
  releaseHebrewFairCodeHolds,
} from '@/lib/events/hebrew-fair-code-holds';
import { ensureEventBySlug } from '@/lib/events/sync';
import {
  bindBbqStaffCodePayment,
  claimBbqStaffCode,
  consumeBbqStaffCode,
  getHeldBbqStaffCode,
  releaseBbqStaffCode,
  reconcileBbqCheckout,
  verifyBbqStaffCode,
} from '@/lib/events/bbq-staff-codes';
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
  bbq?: BbqRegistrationData;
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
  if (lookup.reason === 'exhausted' || lookup.reason === 'already_used') {
    // Neutral wording: no per-member limits are ever shown to customers.
    return 'This Chai code was already used for this event.';
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
): Promise<{ valid: boolean; reason?: string; remainingPeople?: number }> {
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
    return { valid: true, remainingPeople: lookup.remaining };
  }

  const lookup = await verifyHaBayitMemberCode(code, { eventSlug });
  if (!lookup.valid) return { valid: false, reason: lookup.reason };
  return { valid: true };
}

function eventAllowsHebrewKidsFree(event: { type: string; hebrewKidsFreeWithCode?: boolean }) {
  return event.hebrewKidsFreeWithCode === true || event.type === 'family-fair';
}

/**
 * Live check for a BBQ staff code (no claim). Neutral wording: who the
 * codes are for is never shown on the site.
 */
export async function verifyBbqStaffCodeAction(
  code: string,
  eventSlug?: string,
): Promise<{ valid: boolean; reason?: string }> {
  const limited = await enforceActionRateLimit('bbq-staff-code', 12, 15 * 60 * 1000);
  if (!limited.ok) {
    return { valid: false, reason: limited.error };
  }

  const event = eventSlug ? getPaidEvent(eventSlug) : null;
  if (!event || event.type !== 'bbq') return { valid: false, reason: 'invalid' };

  const ownedClaimToken = (await cookies()).get('bbq_claim_token')?.value;
  const lookup = await verifyBbqStaffCode(code, ownedClaimToken);
  if (!lookup.supported) {
    return {
      valid: false,
      reason:
        'We could not verify that code right now. Please try again in a moment, or continue without it at full price.',
    };
  }
  if (!lookup.valid) return { valid: false, reason: lookup.reason === 'in_progress' ? 'This code has a checkout in progress. Please finish it in the original browser or try again later.' : lookup.reason };
  return { valid: true };
}

export async function submitPaidEventRegistration(
  input: PaidEventRegistrationInput,
): Promise<PaidEventRegistrationResult> {
  const limited = await enforceActionRateLimit('paid-event-register', 20, 15 * 60 * 1000);
  if (!limited.ok) return { success: false, error: limited.error };

  const ready = assertSupabaseWriteReady();
  if (!ready.ok) return { success: false, error: ready.error };

  let freeBbqClaimToken: string | undefined;
  let bbqRegistrationPersisted = false;
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
        bbq: input.bbq,
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

    let bbqData = input.bbq;
    // Staff code held for this registration (migration 0031). A paid
    // checkout claims the code in the intent route before being charged;
    // a free ($0) registration claims it here, right before persist.
    let bbqStaffClaim: { token: string; code: string } | null = null;
    if (event.type === 'bbq') {
      const attendees = Math.max(0, Math.round(input.bbq?.attendees || 0));
      if (attendees < 1) {
        return { success: false, error: 'Please enter how many people are attending.' };
      }
      const rawCode = input.bbq?.staffCode?.trim() || '';
      if (rawCode) {
        const failCode = async (message: string) => {
          if (bbqStaffClaim && !input.paymentIntentId) {
            await releaseBbqStaffCode(bbqStaffClaim.token);
          }
          return { success: false as const, error: message };
        };
        if (input.paymentIntentId) {
          // Paid path: the intent route claimed the code before charging.
          const held = await getHeldBbqStaffCode(input.paymentIntentId);
          if (held === undefined) {
            return await failCode(
              'We could not verify that code right now. Please try again in a moment, or continue without it at full price.',
            );
          }
          if (held) {
            bbqStaffClaim = { token: held.claimToken, code: held.code };
          } else {
            // Late claim (hold released after a failed first submit): the
            // payment already happened, so claim and bind to the SAME
            // intent - never reject a paid registration.
            const lookup = await verifyBbqStaffCode(rawCode);
            if (!lookup.supported) {
              return await failCode(
                'We could not verify that code right now. Please try again in a moment, or continue without it at full price.',
              );
            }
            if (!lookup.valid || !lookup.code) {
              return await failCode(
                lookup.reason === 'already_used'
                  ? 'This code was already used.'
                  : lookup.reason === 'in_progress' ? 'This code has a checkout in progress. Please try again later.' : 'This code is not valid.',
              );
            }
            const token = crypto.randomUUID();
            const claim = await claimBbqStaffCode({ code: lookup.code, claimToken: token });
            if (!claim.supported || claim.error) {
              return await failCode(
                'We could not verify that code right now. Please try again in a moment, or continue without it at full price.',
              );
            }
            if (!claim.claimed) {
              return await failCode('This code has a checkout in progress. Please try again later.');
            }
            await bindBbqStaffCodePayment(token, input.paymentIntentId);
            bbqStaffClaim = { token, code: lookup.code };
          }
        } else {
          // A formerly paid cart changed to free must resolve its owned hold
          // before a fresh free claim. Never touch another browser's checkout.
          const retry = await reconcileBbqCheckout({ code: rawCode,
            ownedClaimToken: (await cookies()).get('bbq_claim_token')?.value,
            amountCents: 0, eventSlug: event.slug, email: input.email.trim().toLowerCase(), attendees, sponsorAmount: input.sponsorAmount ?? 0, coverFee: !!input.coverFee });
          if (retry.kind !== 'available') return await failCode(retry.kind === 'used'
            ? 'This code was already used.' : 'This code has a checkout in progress. Please finish it in the original browser or try again later.');
          const lookup = await verifyBbqStaffCode(rawCode);
          if (!lookup.supported) {
            return await failCode(
              'We could not verify that code right now. Please try again in a moment, or continue without it at full price.',
            );
          }
          if (!lookup.valid || !lookup.code) {
            return await failCode(
              lookup.reason === 'already_used'
                ? 'This code was already used.'
                : lookup.reason === 'in_progress' ? 'This code has a checkout in progress. Please try again later.' : 'This code is not valid.',
            );
          }
          const token = crypto.randomUUID();
          const claim = await claimBbqStaffCode({ code: lookup.code, claimToken: token });
          if (!claim.supported || claim.error) {
            return await failCode(
              'We could not verify that code right now. Please try again in a moment, or continue without it at full price.',
            );
          }
          if (!claim.claimed) {
            return await failCode('This code has a checkout in progress. Please try again later.');
          }
          bbqStaffClaim = { token, code: lookup.code };
          freeBbqClaimToken = token;
        }
        bbqData = { attendees, staffCode: bbqStaffClaim.code, staffFree: true };
      } else {
        bbqData = { attendees, staffFree: false };
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
      const nonSkaterCount = Math.max(0, Math.round(input.skate?.nonSkaters || 0));
      if (skaterCount + nonSkaterCount < 1) {
        return { success: false, error: 'Please add at least one ticket.' };
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
            nonSkaters: nonSkaterCount,
            memberCode: held.code,
            memberDiscount: true,
            memberPeople: held.count,
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
            nonSkaters: nonSkaterCount,
            memberCode: lookup.code,
            memberDiscount: true,
            memberPeople: lookup.remaining,
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
            nonSkaters: nonSkaterCount,
            memberCode: lookup.code,
            memberDiscount: true,
            memberPeople: lookup.remaining,
          };
        }
      } else {
        skateData = { skaters: skaterCount, nonSkaters: nonSkaterCount, memberDiscount: false };
      }

      // Hebrew Adventure codes: 15% off one skater per code. Discounts
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
              // This code's own holds are reconciled against Stripe
              // first (a hold never frees by time alone, and a
              // never-charged checkout is canceled to a terminal state
              // before release); migration 0030 missing or unreconciled
              // state fails closed. This PI is already PAID, so the
              // re-claim below must not be blocked by the code's own
              // abandoned checkouts.
              const ownedHaToken = (await cookies()).get('ha_claim_token')?.value;
              const reconcile = await reconcileOwnHebrewFairCodeHolds({
                eventId: haEventId,
                registrationId: lookup.registrationId,
                ownedClaimTokens: ownedHaToken ? [ownedHaToken] : [],
              });
              if (!reconcile.supported || reconcile.failures > 0 || reconcile.pending > 0) {
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
                // Own holds were reconciled above; a refused claim means
                // a competing checkout with the same code is in flight.
                return await failHa(
                  'A checkout with this Hebrew Adventure code is still in progress. Please wait a few minutes, then try again.',
                );
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
      bbq: bbqData,
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
      bbq: bbqData,
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
      // Charged skate checkouts NEVER release discount holds on persist
      // failure - neither Chai allowance nor HA code holds. Payment was
      // verified succeeded BEFORE persist ran, so this checkout was
      // already charged: freeing its discount slots would (a) let
      // another checkout take them and make the paid retry fail
      // (pay-then-reject), and (b) silently restore the member's
      // allowance so a later registration could exceed the cap. The
      // retry finds the held rows (reserved OR already-consumed) as its
      // discount proof; if the user never retries, the expired hold is
      // reconciled against Stripe (succeeded PI -> consumed + logged
      // for admin recovery), never freed by time alone.
      // Charged BBQ checkouts NEVER release the staff code hold on
      // persist failure - the payment was verified before persist ran,
      // so this checkout was already charged: freeing the code would
      // let another checkout take it and make the paid retry fail. The
      // retry finds the held row as its discount proof; if the user
      // never retries, the expired hold is reconciled against Stripe
      // (succeeded PI -> consumed + logged), never freed by time alone.
      // An unpaid (free) registration's hold is released safely.
      if (bbqStaffClaim && !input.paymentIntentId) {
        await releaseBbqStaffCode(bbqStaffClaim.token);
      }
      return { success: false, error: result.error };
    }

    bbqRegistrationPersisted = true;
    if (bbqStaffClaim) {
      await consumeBbqStaffCode({
        claimToken: bbqStaffClaim.token,
        registrationId: result.registrationId,
      });
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
    if (freeBbqClaimToken && !bbqRegistrationPersisted) {
      await releaseBbqStaffCode(freeBbqClaimToken).catch(() => undefined);
    }
    console.error('[paid event] submission error:', err);
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}
