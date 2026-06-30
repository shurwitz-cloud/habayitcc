import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import type Stripe from 'stripe';

export interface SubscriptionRequestBody {
  amountCents: number;
  donorFirstName: string;
  donorLastName: string;
  donorEmail: string;
  donorPhone?: string;
  type: 'monthly_donation' | 'chai_partner';
  // Additional fields for chai_partner type
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as SubscriptionRequestBody;
    const { amountCents, donorFirstName, donorLastName, donorEmail, donorPhone, type } = body;

    if (!amountCents || amountCents < 100) {
      return NextResponse.json({ error: 'Invalid amount.' }, { status: 400 });
    }
    if (!donorEmail) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const productName =
      type === 'chai_partner'
        ? 'HaBayit Chai Partner — Monthly Gift'
        : 'HaBayit Monthly Donation';

    const customer = await stripe.customers.create({
      name: `${donorFirstName} ${donorLastName}`.trim(),
      email: donorEmail,
      phone: donorPhone,
      metadata: {
        type,
        first_name: donorFirstName,
        last_name: donorLastName,
        ...(type === 'chai_partner' && {
          street: body.street ?? '',
          city: body.city ?? '',
          state: body.state ?? '',
          zip: body.zip ?? '',
        }),
      },
    });

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: productName },
            unit_amount: amountCents,
            recurring: { interval: 'month' },
          },
        },
      ],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        payment_method_types: ['card'],
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice'],
      metadata: {
        type,
        donor_name: `${donorFirstName} ${donorLastName}`.trim(),
        donor_email: donorEmail,
      },
    });

    // In Stripe API 2026-06-24.dahlia, the client_secret lives on
    // invoice.confirmation_secret.client_secret (not invoice.payment_intent)
    const invoice = subscription.latest_invoice as Stripe.Invoice | null;
    const clientSecret = invoice?.confirmation_secret?.client_secret ?? null;

    if (!clientSecret) {
      throw new Error('No client_secret returned from subscription invoice.');
    }

    // The PaymentIntent ID is the prefix of the client_secret (format: pi_xxx_secret_yyy)
    const paymentIntentId = clientSecret.split('_secret_')[0] ?? null;

    return NextResponse.json({
      clientSecret,
      subscriptionId: subscription.id,
      customerId: customer.id,
      paymentIntentId,
    });
  } catch (err) {
    console.error('create-subscription error:', err);
    return NextResponse.json({ error: 'Failed to initialize subscription.' }, { status: 500 });
  }
}
