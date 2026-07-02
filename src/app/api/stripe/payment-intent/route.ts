import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';

export async function POST(req: NextRequest) {
  try {
    const { amountCents, donorName, donorEmail, memo, campaign, dedicationName, dedicationType } =
      await req.json() as {
        amountCents: number;
        donorName: string;
        donorEmail: string;
        memo?: string;
        campaign?: string;
        dedicationName?: string;
        dedicationType?: 'honor' | 'memory';
      };

    if (!amountCents || amountCents < 100) {
      return NextResponse.json({ error: 'Invalid amount.' }, { status: 400 });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      payment_method_types: ['card'],
      receipt_email: donorEmail || undefined,
      description: 'Donation to HaBayit Jewish Center',
      metadata: {
        type: 'donation',
        donation_type: 'one_time',
        donor_name: donorName,
        donor_email: donorEmail,
        ...(memo && { memo }),
        ...(campaign && { campaign }),
        ...(dedicationName && { dedication_name: dedicationName }),
        ...(dedicationType && { dedication_type: dedicationType }),
      },
    });

    return NextResponse.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('create-payment-intent error:', err);
    return NextResponse.json({ error: 'Failed to initialize payment.' }, { status: 500 });
  }
}
