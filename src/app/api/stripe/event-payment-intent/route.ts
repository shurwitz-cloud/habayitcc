import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { normalizeDonorEmail } from '@/lib/donations/normalize-donor';
import { getPaidEvent } from '@/lib/events/paid-events';
import {
  computePaidEventTotal,
  totalToCents,
  type DinnerRegistrationData,
  type FairRegistrationData,
  type WomensRegistrationData,
} from '@/lib/events/paid-event-pricing';
import { verifyHebrewFairCode } from '@/lib/events/hebrew-fair-codes';

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
    };

    const event = getPaidEvent(body.slug);
    if (!event) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
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

    const pricing = computePaidEventTotal({
      event,
      dinner: body.dinner,
      fair: body.fair,
      fairFreeChildIndices,
      womens: body.womens,
      sponsorAmount: body.sponsorAmount ?? 0,
      coverFee: !!body.coverFee,
    });

    const expectedCents = totalToCents(pricing.total);
    if (expectedCents < 0 || body.amountCents !== expectedCents) {
      return NextResponse.json({ error: 'Payment amount mismatch. Please refresh and try again.' }, { status: 400 });
    }

    if (expectedCents === 0) {
      return NextResponse.json({ error: 'No payment required for this registration.' }, { status: 400 });
    }

    const donorName = `${body.firstName.trim()} ${body.lastName.trim()}`.replace(/\s+/g, ' ');

    const paymentIntent = await stripe.paymentIntents.create({
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
        adults: event.type === 'dinner' ? String(body.dinner?.adults ?? 0) : '',
        kids: event.type === 'dinner' ? String(body.dinner?.kids ?? 0) : '',
        fair_children:
          event.type === 'family-fair' ? String(body.fair?.children?.length ?? 0) : '',
      },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err) {
    console.error('[event-payment-intent]', err);
    return NextResponse.json({ error: 'Failed to initialize payment.' }, { status: 500 });
  }
}
