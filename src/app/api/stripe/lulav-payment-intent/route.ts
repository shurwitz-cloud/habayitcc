import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { computeLulavPricing } from '@/lib/lulav/pricing';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      quantity?: number;
      coverFee?: boolean;
      fullName?: string;
      email?: string;
      phone?: string;
      amountCents?: number;
    };

    const quantity = Math.floor(Number(body.quantity) || 0);
    if (quantity < 1 || quantity > 50) {
      return NextResponse.json(
        { error: 'Please order between 1 and 50 sets.' },
        { status: 400 }
      );
    }

    const email = (body.email ?? '').trim().toLowerCase();
    const fullName = (body.fullName ?? '').trim().replace(/\s+/g, ' ');
    const phone = (body.phone ?? '').trim();
    if (!fullName || !email || !phone) {
      return NextResponse.json(
        { error: 'Name, email, and phone are required.' },
        { status: 400 }
      );
    }

    const pricing = computeLulavPricing(quantity, 'card', true);
    if (pricing.totalCents < 100) {
      return NextResponse.json({ error: 'Invalid amount.' }, { status: 400 });
    }

    if (
      typeof body.amountCents === 'number' &&
      body.amountCents !== pricing.totalCents
    ) {
      return NextResponse.json(
        { error: 'Amount mismatch. Please refresh and try again.' },
        { status: 400 }
      );
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: pricing.totalCents,
      currency: 'usd',
      payment_method_types: ['card'],
      description: `Lulav & Etrog — ${quantity} set${quantity === 1 ? '' : 's'}`,
      receipt_email: email,
      metadata: {
        type: 'lulav_order',
        quantity: String(quantity),
        cover_fee: 'true',
        subtotal: pricing.subtotal.toFixed(2),
        card_fee: pricing.cardFee.toFixed(2),
        total: pricing.total.toFixed(2),
        full_name: fullName,
        email,
        phone,
      },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err) {
    console.error('lulav-payment-intent error:', err);
    return NextResponse.json({ error: 'Failed to initialize payment.' }, { status: 500 });
  }
}
