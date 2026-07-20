import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import type Stripe from 'stripe';

export interface SubscriptionRequestBody {
  amountCents: number;
  donorFirstName: string;
  donorLastName: string;
  donorEmail: string;
  donorPhone?: string;
  memo?: string;
  campaign?: string;
  dedicationName?: string;
  dedicationType?: 'honor' | 'memory';
  type: 'monthly_donation' | 'chai_partner';
  /** Card (default) or ACH bank debit. */
  paymentMethod?: 'card' | 'ach';
  // Additional fields for chai_partner type
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as SubscriptionRequestBody;
    const {
      amountCents,
      donorFirstName,
      donorLastName,
      donorEmail,
      donorPhone,
      memo,
      campaign,
      dedicationName,
      dedicationType,
      type,
      paymentMethod = 'card',
    } = body;

    if (!amountCents || amountCents < 100) {
      return NextResponse.json({ error: 'Invalid amount.' }, { status: 400 });
    }
    if (type === 'chai_partner' && amountCents < 15000) {
      return NextResponse.json(
        { error: 'Chai Partner monthly gifts must be at least $150.' },
        { status: 400 }
      );
    }
    if (!donorEmail) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }
    if (paymentMethod !== 'card' && paymentMethod !== 'ach') {
      return NextResponse.json({ error: 'Invalid payment method.' }, { status: 400 });
    }

    const productName =
      type === 'chai_partner'
        ? 'HaBayit Chai Partner — Monthly Gift'
        : 'HaBayit Monthly Donation';

    const product = await stripe.products.create({ name: productName });

    const customer = await stripe.customers.create({
      name: `${donorFirstName} ${donorLastName}`.trim(),
      email: donorEmail,
      phone: donorPhone,
      metadata: {
        type,
        first_name: donorFirstName,
        last_name: donorLastName,
        payment_method_preference: paymentMethod,
        ...(type === 'chai_partner' && {
          street: body.street ?? '',
          city: body.city ?? '',
          state: body.state ?? '',
          zip: body.zip ?? '',
        }),
      },
    });

    const isAch = paymentMethod === 'ach';

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [
        {
          price_data: {
            currency: 'usd',
            product: product.id,
            unit_amount: amountCents,
            recurring: { interval: 'month' },
          },
        },
      ],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        payment_method_types: isAch ? ['us_bank_account'] : ['card'],
        save_default_payment_method: 'on_subscription',
      },
      ...(isAch
        ? {
            payment_method_options: {
              us_bank_account: {
                financial_connections: {
                  permissions: ['payment_method'],
                },
                verification_method: 'automatic' as const,
              },
            },
          }
        : {}),
      expand: ['latest_invoice.confirmation_secret'],
      metadata: {
        type,
        donor_name: `${donorFirstName} ${donorLastName}`.trim(),
        donor_email: donorEmail,
        payment_method_preference: paymentMethod,
        ...(memo && { memo }),
        ...(campaign && { campaign }),
        ...(dedicationName && { dedication_name: dedicationName }),
        ...(dedicationType && { dedication_type: dedicationType }),
      },
    });

    // In Stripe API 2026-06-24.dahlia, the client_secret lives on
    // invoice.confirmation_secret.client_secret (not invoice.payment_intent)
    const invoice = subscription.latest_invoice as Stripe.Invoice | null;
    let clientSecret = invoice?.confirmation_secret?.client_secret ?? null;

    if (!clientSecret && invoice?.id) {
      const retrieved = await stripe.invoices.retrieve(invoice.id, {
        expand: ['confirmation_secret'],
      });
      clientSecret = retrieved.confirmation_secret?.client_secret ?? null;
    }

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
