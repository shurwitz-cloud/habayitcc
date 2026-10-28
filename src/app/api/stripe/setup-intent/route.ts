import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';

export async function POST(req: NextRequest) {
  try {
    const { email, name, paymentMethod } = await req.json() as {
      email: string;
      name: string;
      paymentMethod: 'card' | 'bank';
    };

    const trimmedEmail = email?.trim().toLowerCase();
    const hasValidEmail = Boolean(trimmedEmail && trimmedEmail.includes('@'));
    if (paymentMethod !== 'card' && paymentMethod !== 'bank') {
      return NextResponse.json({ error: 'Invalid payment method.' }, { status: 400 });
    }

    let customerId: string | undefined;
    if (hasValidEmail) {
      const customer = await stripe.customers.create({
        email: trimmedEmail,
        name: name?.trim() || undefined,
        metadata: {
          source: 'hebrew_adventure_registration',
        },
      });
      customerId = customer.id;
    }

    const paymentMethodTypes =
      paymentMethod === 'bank' ? (['us_bank_account'] as const) : (['card'] as const);

    const setupIntent = await stripe.setupIntents.create({
      ...(customerId ? { customer: customerId } : {}),
      payment_method_types: [...paymentMethodTypes],
      usage: 'off_session',
      metadata: {
        type: 'hebrew_adventure_registration',
        ...(hasValidEmail ? { email: trimmedEmail } : {}),
        payment_method_preference: paymentMethod,
      },
      ...(paymentMethod === 'bank'
        ? {
            payment_method_options: {
              us_bank_account: {
                financial_connections: {
                  permissions: ['payment_method'],
                },
                verification_method: 'automatic',
              },
            },
          }
        : {}),
    });

    if (!setupIntent.client_secret) {
      return NextResponse.json({ error: 'Failed to initialize payment setup.' }, { status: 500 });
    }

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
      ...(customerId ? { customerId } : {}),
    });
  } catch (err) {
    console.error('create-setup-intent error:', err);
    return NextResponse.json({ error: 'Failed to initialize payment setup.' }, { status: 500 });
  }
}
