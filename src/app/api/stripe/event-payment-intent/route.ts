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
    if (event.type === 'family-fair' && body.fair?.children?.length) {
      for (let i = 0; i < body.fair.children.length; i++) {
        const code = body.fair.children[i]?.hebrewCode?.trim();
        if (!code) continue;
        const lookup = await verifyHebrewFairCode(code);
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
        ticket_subtotal: String(pricing.ticketSubtotal),
        sponsor_amount: String(pricing.sponsorAmount),
        card_fee: String(pricing.cardFee),
      },
    });

    return NextResponse.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('[event-payment-intent]', err);
    return NextResponse.json({ error: 'Failed to initialize payment.' }, { status: 500 });
  }
}
