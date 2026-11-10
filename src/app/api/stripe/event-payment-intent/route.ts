import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { normalizeDonorEmail } from '@/lib/donations/normalize-donor';
import { getPaidEvent } from '@/lib/events/paid-events';
import {
  assertPaidEventHasRoom,
  paidEventUnitsFromInput,
} from '@/lib/events/paid-event-capacity';
import {
  computePaidEventTotal,
  totalToCents,
  type CouplesRegistrationData,
  type DinnerRegistrationData,
  type FairRegistrationData,
  type SkateRegistrationData,
  type WomensRegistrationData,
} from '@/lib/events/paid-event-pricing';
import { verifyHebrewFairCode } from '@/lib/events/hebrew-fair-codes';
import {
  SKATE_MEMBER_PEOPLE_LIMIT,
  verifyHaBayitMemberCode,
  verifySkateMemberCode,
} from '@/lib/events/chai-member-event-codes';
import {
  bindSkateAllowancePayment,
  claimSkateAllowance,
  getHeldSkateAllowance,
  reconcileOwnSkateHolds,
  releaseSkateAllowance,
} from '@/lib/events/skate-allowance';
import {
  bindHebrewFairCodePayment,
  claimHebrewFairCodeHold,
  getHeldHebrewFairCodeClaims,
  reconcileOwnHebrewFairCodeHolds,
  releaseHebrewFairCodeHolds,
} from '@/lib/events/hebrew-fair-code-holds';
import { ensureEventBySlug } from '@/lib/events/sync';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      slug: string;
      amountCents: number;
      firstName: string;
      lastName: string;
      email: string;
      phone?: string;
      coverFee: boolean;
      sponsorAmount: number;
      dinner?: DinnerRegistrationData;
      fair?: FairRegistrationData;
      womens?: WomensRegistrationData;
      couples?: CouplesRegistrationData;
      skate?: SkateRegistrationData;
    };

    const event = getPaidEvent(body.slug);
    if (!event) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    }
    const room = await assertPaidEventHasRoom(
      event,
      paidEventUnitsFromInput(event, {
        couples: body.couples,
        dinner: body.dinner,
        fair: body.fair,
        womens: body.womens,
        skate: body.skate,
      }),
    );
    if (!room.ok) {
      return NextResponse.json({ error: room.error }, { status: 400 });
    }

    const email = normalizeDonorEmail(body.email ?? '');
    if (!email || !body.firstName?.trim() || !body.lastName?.trim()) {
      return NextResponse.json({ error: 'Name and email are required.' }, { status: 400 });
    }

    const fairFreeChildIndices = new Set<number>();
    const allowsHebrewFree =
      event.hebrewKidsFreeWithCode === true || event.type === 'family-fair';
    if (allowsHebrewFree && body.fair?.children?.length) {
      const seenCodes = new Set<string>();
      for (let i = 0; i < body.fair.children.length; i++) {
        const code = body.fair.children[i]?.hebrewCode?.trim();
        if (!code) continue;
        const normalized = code.toUpperCase();
        if (seenCodes.has(normalized)) {
          return NextResponse.json(
            { error: 'Each Hebrew code can only free one child on this registration.' },
            { status: 400 }
          );
        }
        seenCodes.add(normalized);
        const lookup = await verifyHebrewFairCode(code, { eventSlug: event.slug });
        if (lookup.valid) fairFreeChildIndices.add(i);
      }
    }

    let couplesData = body.couples;
    if (event.type === 'couples') {
      const coupleCount = Math.max(0, Math.round(body.couples?.couples || 0));
      if (coupleCount < 1) {
        return NextResponse.json({ error: 'Please add at least one couple.' }, { status: 400 });
      }
      const rawCode = body.couples?.memberCode?.trim() || '';
      if (rawCode) {
        const lookup = await verifyHaBayitMemberCode(rawCode, { eventSlug: event.slug });
        if (!lookup.valid || !lookup.code) {
          const reasonMsg =
            lookup.reason === 'already_used'
              ? 'This HaBayit member code was already used for this event.'
              : lookup.reason === 'not_eligible'
                ? 'This HaBayit member code is not active.'
                : 'This HaBayit member code is not valid.';
          return NextResponse.json({ error: reasonMsg }, { status: 400 });
        }
        couplesData = {
          couples: coupleCount,
          memberCode: lookup.code,
          memberDiscount: true,
        };
      } else {
        couplesData = { couples: coupleCount, memberDiscount: false };
      }
    }

    let skateData = body.skate;
    // Held discount slots for this checkout (migration 0028). Claimed
    // before the payment intent exists so a discount is never charged
    // without an allowance, and never rejected after charging.
    let skateClaim: { token: string; claimed: number } | null = null;
    // Held Hebrew Adventure codes for this checkout (migration 0030),
    // claimed before the payment intent exists.
    let haClaim: { token: string; claimed: Array<{ registrationId: string; code: string }> } | null =
      null;
    if (event.type === 'skate') {
      const skaterCount = Math.max(0, Math.round(body.skate?.skaters || 0));
      const nonSkaterCount = Math.max(0, Math.round(body.skate?.nonSkaters || 0));
      if (skaterCount + nonSkaterCount < 1) {
        return NextResponse.json({ error: 'Please add at least one ticket.' }, { status: 400 });
      }
      const rawCode = body.skate?.memberCode?.trim() || '';
      const rawHaCodes = (body.skate?.haCodes ?? [])
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean);
      const needsEventId = !!rawCode || rawHaCodes.length > 0;
      const eventId = needsEventId ? await ensureEventBySlug(event.slug) : null;
      if (needsEventId && !eventId) {
        return NextResponse.json(
          { error: 'We could not verify your code right now. Please try again in a moment, or continue without the code at full price.' },
          { status: 400 },
        );
      }
      if (rawCode) {
        const verifyInput = {
          eventSlug: event.slug,
          firstName: body.firstName,
          lastName: body.lastName,
          email,
          phone: body.phone,
        };
        let lookup = await verifySkateMemberCode(rawCode, verifyInput);
        if (lookup.partnerId && eventId) {
          // Code verification counts only PAID usage (so an abandoned
          // checkout never locks the member out), but the atomic claim
          // counts every reserved row. Reconcile the member's OWN holds
          // against Stripe's live state FIRST (never time-freed): a
          // succeeded payment is consumed (verify then reports the code
          // as used), a canceled or never-charged one is canceled to a
          // terminal state and released, and a payment still processing
          // is left in place with an accurate "still processing" reply -
          // never a false "already used". Any unreconciled state fails
          // closed without a discount.
          const ownedSkateToken = req.cookies.get('chai_claim_token')?.value;
          // Candidate total for RESUME matching: a held Chai claim is
          // always the full entitlement, so the resumed checkout's PI
          // amount must equal the cart priced with memberPeople = the
          // entitlement (HA codes are ignored when Chai applies).
          const chaiCandidateCents = totalToCents(
            computePaidEventTotal({
              event,
              dinner: body.dinner,
              fair: body.fair,
              fairFreeChildIndices,
              womens: body.womens,
              couples: couplesData,
              skate: {
                skaters: skaterCount,
                nonSkaters: nonSkaterCount,
                memberCode: lookup.code ?? rawCode,
                memberDiscount: true,
                memberPeople: SKATE_MEMBER_PEOPLE_LIMIT,
              },
              sponsorAmount: body.sponsorAmount ?? 0,
              coverFee: !!body.coverFee,
            }).total,
          );
          const reconcile = await reconcileOwnSkateHolds({
            eventId,
            partnerId: lookup.partnerId,
            // Only the checkout that owns its claim-token cookie may be
            // canceled or resumed; a live checkout in ANOTHER browser
            // stays pending instead of being canceled out from under
            // its payer.
            ownedClaimTokens: ownedSkateToken ? [ownedSkateToken] : [],
            resumeAmountCents: chaiCandidateCents,
          });
          if (reconcile.supported && reconcile.resumes.length > 0) {
            // Load-bearing recheck before resuming: the held code,
            // event and amount must all match THIS request. Any
            // mismatch falls through to the normal claim path (the
            // hold then blocks as in-progress - fail closed).
            const cand = reconcile.resumes[0];
            try {
              const held = await getHeldSkateAllowance(cand.paymentIntentId);
              const pi = await stripe.paymentIntents.retrieve(cand.paymentIntentId);
              if (
                held &&
                held.partnerId === lookup.partnerId &&
                held.code === lookup.code &&
                held.count === SKATE_MEMBER_PEOPLE_LIMIT &&
                pi.metadata?.event_slug === event.slug &&
                pi.amount === chaiCandidateCents &&
                (pi.status === 'requires_payment_method' ||
                  pi.status === 'requires_confirmation' ||
                  pi.status === 'requires_action')
              ) {
                const res = NextResponse.json({
                  clientSecret: pi.client_secret,
                  paymentIntentId: pi.id,
                });
                res.cookies.set('chai_claim_token', cand.claimToken, {
                  httpOnly: true,
                  sameSite: 'lax',
                  path: '/',
                  maxAge: 24 * 60 * 60,
                });
                return res;
              }
            } catch (resumeErr) {
              console.error('[event-payment-intent] Chai resume recheck failed:', resumeErr);
            }
          }
          if (reconcile.supported && reconcile.pending > 0) {
            return NextResponse.json(
              { error: 'A checkout with this Chai code is still in progress. Please wait a few minutes, then try again.' },
              { status: 400 },
            );
          }
          if (reconcile.supported && reconcile.failures > 0) {
            return NextResponse.json(
              { error: 'We could not verify your Chai code right now. Please try again in a moment, or continue without the code at full price.' },
              { status: 400 },
            );
          }
          if (reconcile.supported) {
            lookup = await verifySkateMemberCode(rawCode, verifyInput);
          }
        }
        if (!lookup.valid || !lookup.code) {
          const reasonMsg =
            lookup.reason === 'identity_mismatch'
              ? 'This Chai code does not match these details. Correct the name, email or phone, or continue without the code at full price.'
              : lookup.reason === 'exhausted' || lookup.reason === 'already_used'
                ? 'This Chai code was already used for this event.'
                : lookup.reason === 'unverified'
                  ? 'We could not verify your Chai code right now. Please try again in a moment, or continue without the code at full price.'
                  : 'This HaBayit member code is not valid or not active.';
          return NextResponse.json({ error: reasonMsg }, { status: 400 });
        }
        // The reservation system is the ONLY allowance path for this
        // event (it went live with the schema in place): the atomic
        // claim decides, and any uncertainty fails closed without
        // granting a discount.
        if (lookup.partnerId) {
          const token = crypto.randomUUID();
          // One discounted reservation per member per event: claim the
          // member's WHOLE entitlement so no second discounted checkout
          // can start while this one is open. A partial grant means the
          // member already used part of it elsewhere - never honor a
          // partial discount, release the partial claim.
          const claim = await claimSkateAllowance({
            eventId: eventId as string,
            partnerId: lookup.partnerId,
            code: lookup.code,
            wanted: SKATE_MEMBER_PEOPLE_LIMIT,
            claimToken: token,
            limit: SKATE_MEMBER_PEOPLE_LIMIT,
          });
          if (!claim.supported || claim.error) {
            return NextResponse.json(
              { error: 'We could not verify your Chai code right now. Please try again in a moment, or continue without the code at full price.' },
              { status: 400 },
            );
          }
          if (claim.claimed < SKATE_MEMBER_PEOPLE_LIMIT) {
            // The member's own holds were just reconciled above, so a
            // partial grant means a COMPETING checkout on the same
            // account is holding slots right now. Release the partial
            // claim and say so accurately - not "already used".
            await releaseSkateAllowance({ claimToken: token });
            return NextResponse.json(
              { error: 'A checkout with this Chai code is still in progress. Please wait a few minutes, then try again.' },
              { status: 400 },
            );
          }
          skateClaim = { token, claimed: claim.claimed };
        }
        const memberPeople = skateClaim?.claimed ?? lookup.remaining;
        skateData = {
          skaters: skaterCount,
          nonSkaters: nonSkaterCount,
          memberCode: lookup.code,
          memberDiscount: true,
          memberPeople,
        };
      } else {
        skateData = { skaters: skaterCount, nonSkaters: nonSkaterCount, memberDiscount: false };
      }

      // Hebrew Adventure codes: 15% off one skater per code (never a
      // non-skater pass). Discounts never stack: when a Chai member
      // discount is applied to this registration, HA codes are IGNORED
      // entirely (the larger discount wins for the whole registration,
      // even beyond the member cap) and are never claimed or consumed.
      // Codes are claimed atomically BEFORE the Stripe payment intent
      // exists (migration 0030); any uncertainty fails closed without
      // granting a discount. Codes beyond the skater count are never
      // claimed either.
      if (rawHaCodes.length && skateData?.memberDiscount !== true) {
        const discountable = skaterCount;
        if (new Set(rawHaCodes).size !== rawHaCodes.length) {
          if (skateClaim) await releaseSkateAllowance({ claimToken: skateClaim.token });
          return NextResponse.json(
            { error: 'Each Hebrew Adventure code can only discount one skater on this registration.' },
            { status: 400 },
          );
        }
        const codesToApply = rawHaCodes.slice(0, discountable);
        if (codesToApply.length) {
          const token = crypto.randomUUID();
          const claimed: Array<{ registrationId: string; code: string }> = [];
          const failHa = async (message: string) => {
            await releaseHebrewFairCodeHolds({ claimToken: token });
            if (skateClaim) await releaseSkateAllowance({ claimToken: skateClaim.token });
            return NextResponse.json({ error: message }, { status: 400 });
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
            // This code's own holds are reconciled against Stripe first
            // (a hold never frees by time alone, and a never-charged
            // checkout is canceled to a terminal state before release);
            // migration 0030 missing or unreconciled state fails closed.
            const ownedHaToken = req.cookies.get('ha_claim_token')?.value;
            // Candidate total for RESUME matching: assume every
            // submitted code discounts one skater; the recheck below
            // recomputes from the ACTUAL held codes before resuming.
            const haCandidateCents = totalToCents(
              computePaidEventTotal({
                event,
                dinner: body.dinner,
                fair: body.fair,
                fairFreeChildIndices,
                womens: body.womens,
                couples: couplesData,
                skate: {
                  skaters: skaterCount,
                  nonSkaters: nonSkaterCount,
                  memberDiscount: false,
                  haCodes: codesToApply,
                  haDiscountedSkaters: codesToApply.length,
                },
                sponsorAmount: body.sponsorAmount ?? 0,
                coverFee: !!body.coverFee,
              }).total,
            );
            const reconcile = await reconcileOwnHebrewFairCodeHolds({
              eventId: eventId as string,
              registrationId: lookup.registrationId,
              // Same ownership rule as the Chai path: never cancel or
              // resume a checkout this request does not own.
              ownedClaimTokens: ownedHaToken ? [ownedHaToken] : [],
              resumeAmountCents: haCandidateCents,
            });
            if (reconcile.supported && reconcile.resumes.length > 0) {
              // Load-bearing recheck before resuming: the resumed PI
              // must hold exactly the submitted valid code set, for
              // this event, at the amount recomputed from the ACTUAL
              // held data. Any mismatch falls through to the normal
              // claim path (the hold then blocks as in-progress).
              const cand = reconcile.resumes[0];
              try {
                const held = await getHeldHebrewFairCodeClaims(cand.paymentIntentId);
                const pi = await stripe.paymentIntents.retrieve(cand.paymentIntentId);
                const validSubmitted: string[] = [];
                for (const c of codesToApply) {
                  const l = await verifyHebrewFairCode(c, { eventSlug: event.slug });
                  if (l.valid && l.registrationId) validSubmitted.push(l.code ?? c);
                }
                const heldCodes = (held?.items ?? []).map((i) => i.code).sort();
                const heldCents = totalToCents(
                  computePaidEventTotal({
                    event,
                    dinner: body.dinner,
                    fair: body.fair,
                    fairFreeChildIndices,
                    womens: body.womens,
                    couples: couplesData,
                    skate: {
                      skaters: skaterCount,
                      nonSkaters: nonSkaterCount,
                      memberDiscount: false,
                      haCodes: heldCodes,
                      haDiscountedSkaters: heldCodes.length,
                    },
                    sponsorAmount: body.sponsorAmount ?? 0,
                    coverFee: !!body.coverFee,
                  }).total,
                );
                if (
                  held &&
                  held.count > 0 &&
                  heldCodes.length === validSubmitted.length &&
                  heldCodes.every((c, i) => c === [...validSubmitted].sort()[i]) &&
                  pi.metadata?.event_slug === event.slug &&
                  pi.amount === heldCents &&
                  (pi.status === 'requires_payment_method' ||
                    pi.status === 'requires_confirmation' ||
                    pi.status === 'requires_action')
                ) {
                  const res = NextResponse.json({
                    clientSecret: pi.client_secret,
                    paymentIntentId: pi.id,
                  });
                  res.cookies.set('ha_claim_token', cand.claimToken, {
                    httpOnly: true,
                    sameSite: 'lax',
                    path: '/',
                    maxAge: 24 * 60 * 60,
                  });
                  return res;
                }
              } catch (resumeErr) {
                console.error('[event-payment-intent] HA resume recheck failed:', resumeErr);
              }
            }
            if (reconcile.supported && reconcile.pending > 0) {
              return await failHa(
                'A checkout with this Hebrew Adventure code is still in progress. Please wait a few minutes, then try again.',
              );
            }
            if (!reconcile.supported || reconcile.failures > 0) {
              return await failHa(
                'We could not verify your Hebrew Adventure code right now. Please try again in a moment, or continue without the code at full price.',
              );
            }
            const claim = await claimHebrewFairCodeHold({
              eventId: eventId as string,
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
              // The code's own holds were just reconciled above, so a
              // refused claim means a COMPETING checkout with the same
              // code is holding it right now - say so accurately.
              return await failHa(
                'A checkout with this Hebrew Adventure code is still in progress. Please wait a few minutes, then try again.',
              );
            }
            claimed.push({ registrationId: lookup.registrationId, code: lookup.code ?? code });
          }
          haClaim = { token, claimed };
          skateData = {
            ...skateData,
            skaters: skaterCount,
            haCodes: claimed.map((c) => c.code),
            haDiscountedSkaters: claimed.length,
          };
        }
      }
    }

    const pricing = computePaidEventTotal({
      event,
      dinner: body.dinner,
      fair: body.fair,
      fairFreeChildIndices,
      womens: body.womens,
      couples: couplesData,
      skate: skateData,
      sponsorAmount: body.sponsorAmount ?? 0,
      coverFee: !!body.coverFee,
    });

    const expectedCents = totalToCents(pricing.total);
    if (expectedCents < 0 || body.amountCents !== expectedCents) {
      if (skateClaim) await releaseSkateAllowance({ claimToken: skateClaim.token });
      if (haClaim) await releaseHebrewFairCodeHolds({ claimToken: haClaim.token });
      return NextResponse.json({ error: 'Payment amount mismatch. Please refresh and try again.' }, { status: 400 });
    }

    if (expectedCents === 0) {
      return NextResponse.json({ error: 'No payment required for this registration.' }, { status: 400 });
    }

    const donorName = `${body.firstName.trim()} ${body.lastName.trim()}`.replace(/\s+/g, ' ');

    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
      amount: expectedCents,
      currency: 'usd',
      payment_method_types: ['card'],
      description: `${event.title} — HaBayit Jewish Center`,
      receipt_email: email,
      metadata: {
        type: 'paid_event_registration',
        event_slug: event.slug,
        donor_name: donorName,
        donor_email: email,
        first_name: body.firstName.trim().slice(0, 80),
        last_name: body.lastName.trim().slice(0, 80),
        phone: String(body.phone ?? '').trim().slice(0, 40),
        ticket_subtotal: String(pricing.ticketSubtotal),
        sponsor_amount: String(pricing.sponsorAmount),
        card_fee: String(pricing.cardFee),
        cover_fee: body.coverFee ? '1' : '0',
        women: event.type === 'womens' ? String(body.womens?.women ?? 1) : '',
        adults:
          event.type === 'dinner' || event.type === 'celebration'
            ? String(body.dinner?.adults ?? 0)
            : '',
        kids:
          event.type === 'dinner' || event.type === 'celebration'
            ? String(body.dinner?.kids ?? 0)
            : '',
        fair_children:
          event.type === 'family-fair' ? String(body.fair?.children?.length ?? 0) : '',
        couples: event.type === 'couples' ? String(couplesData?.couples ?? 0) : '',
        skaters: event.type === 'skate' ? String(skateData?.skaters ?? 0) : '',
        non_skaters: event.type === 'skate' ? String(skateData?.nonSkaters ?? 0) : '',
        member_people:
          event.type === 'skate' && skateData?.memberDiscount
            ? String(
                skateData?.memberPeople ??
                  (skateData?.skaters ?? 0) + (skateData?.nonSkaters ?? 0),
              )
            : '',
        ha_skaters:
          event.type === 'skate' ? String(skateData?.haDiscountedSkaters ?? 0) : '',
        member_code:
          (event.type === 'couples' && couplesData?.memberDiscount) ||
          (event.type === 'skate' && skateData?.memberDiscount)
            ? String(
                (event.type === 'skate' ? skateData?.memberCode : couplesData?.memberCode) ?? '',
              ).slice(0, 40)
            : '',
        member_discount:
          (event.type === 'couples' && couplesData?.memberDiscount) ||
          (event.type === 'skate' && skateData?.memberDiscount)
            ? '1'
            : '0',
      },
    });

    } catch (piErr) {
      if (skateClaim) await releaseSkateAllowance({ claimToken: skateClaim.token });
      if (haClaim) await releaseHebrewFairCodeHolds({ claimToken: haClaim.token });
      throw piErr;
    }
    if (skateClaim) {
      await bindSkateAllowancePayment(skateClaim.token, paymentIntent.id);
    }
    if (haClaim) {
      await bindHebrewFairCodePayment(haClaim.token, paymentIntent.id);
    }

    const res = NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
    // Checkout-ownership proof for a later retry in THIS browser: the
    // claim token lets the reconcile cancel only this browser's own
    // abandoned checkout, never a competing live one. httpOnly +
    // sameSite=lax; expires with the 24h hold TTL.
    if (skateClaim) {
      res.cookies.set('chai_claim_token', skateClaim.token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 24 * 60 * 60,
      });
    }
    if (haClaim) {
      res.cookies.set('ha_claim_token', haClaim.token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 24 * 60 * 60,
      });
    }
    return res;
  } catch (err) {
    console.error('[event-payment-intent]', err);
    return NextResponse.json({ error: 'Failed to initialize payment.' }, { status: 500 });
  }
}
