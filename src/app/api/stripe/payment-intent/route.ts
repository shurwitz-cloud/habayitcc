import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { validatePublicDonationAmountCents } from '@/lib/stripe/amount-limits';
import { normalizeDonorEmail } from '@/lib/donations/normalize-donor';

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

    const amountCheck = validatePublicDonationAmountCents(amountCents);
    if (!amountCheck.ok) {
      return NextResponse.json({ error: amountCheck.error }, { status: 400 });
    }

    const email = normalizeDonorEmail(donorEmail ?? '');
    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCheck.amountCents,
      currency: 'usd',
      payment_method_types: ['card'],
      description: 'Donation to HaBayit Jewish Center',
      receipt_email: email,
      metadata: {
        type: 'donation',
        donation_type: 'one_time',
        donor_name: (donorName ?? '').trim().replace(/\s+/g, ' '),
        donor_email: email,
        ...(memo && { memo: memo.trim() }),
        ...(campaign && { campaign: campaign.trim() }),
        ...(dedicationName && { dedication_name: dedicationName.trim() }),
        ...(dedicationType && { dedication_type: dedicationType }),
      },
    });

    return NextResponse.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('create-payment-intent error:', err);
    return NextResponse.json({ error: 'Failed to initialize payment.' }, { status: 500 });
  }
}
