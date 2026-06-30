import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { createAdminClient } from '@/lib/supabase/server';
import type Stripe from 'stripe';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature or webhook secret.' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      default:
        break;
    }
  } catch (err) {
    // Log but return 200 so Stripe doesn't retry — alert for manual review
    console.error(`Error handling Stripe event ${event.type}:`, err);
  }

  return NextResponse.json({ received: true });
}

// ——— One-time donation payment intents ———

async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent) {
  const { type, donation_type, donor_name, donor_email } = pi.metadata ?? {};

  if (type !== 'donation' || donation_type !== 'one_time') return;

  const supabase = createAdminClient();
  const [firstName, ...rest] = (donor_name ?? '').split(' ');
  const lastName = rest.join(' ');
  const amountDollars = pi.amount / 100;

  const { data: existing } = await supabase
    .from('donations')
    .select('id')
    .eq('stripe_payment_intent_id', pi.id)
    .maybeSingle();

  if (existing) return; // Already recorded by client-side action

  const { data: donation, error } = await supabase
    .from('donations')
    .insert({
      first_name: firstName ?? '',
      last_name: lastName ?? '',
      email: donor_email ?? '',
      amount: amountDollars,
      stripe_payment_intent_id: pi.id,
      status: 'succeeded',
      family_id: null,
      phone: null,
      dedication_name: null,
      dedication_type: null,
    })
    .select('id')
    .single();

  if (error || !donation) {
    console.error('Webhook: failed to insert donation:', error);
    return;
  }

  await supabase.from('payments').insert({
    source_type: 'donation',
    source_id: donation.id,
    amount: amountDollars,
    stripe_payment_intent_id: pi.id,
    stripe_charge_id: typeof pi.latest_charge === 'string' ? pi.latest_charge : null,
    status: 'succeeded',
    paid_at: new Date().toISOString(),
  });
}

// ——— Recurring subscription payments ———

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  // Skip the first invoice — handled by client-side confirmation
  if (invoice.billing_reason === 'subscription_create') return;

  const supabase = createAdminClient();
  const amountDollars = invoice.amount_paid / 100;

  const subscriptionId = typeof invoice.subscription === 'string'
    ? invoice.subscription
    : (invoice.subscription as Stripe.Subscription | null)?.id ?? null;

  if (!subscriptionId) return;

  // Extract the payment intent ID from the confirmation_secret client_secret
  // Format: pi_xxx_secret_yyy → payment intent ID is pi_xxx
  const piId = invoice.confirmation_secret?.client_secret?.split('_secret_')[0] ?? null;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const { type, donor_email, donor_name } = subscription.metadata ?? {};

  if (!type || !donor_email) return;

  if (type === 'monthly_donation') {
    const [firstName, ...rest] = (donor_name ?? '').split(' ');
    const lastName = rest.join(' ');

    const { data: donation, error } = await supabase
      .from('donations')
      .insert({
        first_name: firstName ?? '',
        last_name: lastName ?? '',
        email: donor_email,
        amount: amountDollars,
        stripe_payment_intent_id: piId,
        status: 'succeeded',
        family_id: null,
        phone: null,
        dedication_name: null,
        dedication_type: null,
      })
      .select('id')
      .single();

    if (!error && donation) {
      await supabase.from('payments').insert({
        source_type: 'donation',
        source_id: donation.id,
        amount: amountDollars,
        stripe_payment_intent_id: piId,
        stripe_charge_id: null,
        status: 'succeeded',
        paid_at: new Date().toISOString(),
      });
    }
  }

  if (type === 'chai_partner') {
    const { data: partner } = await supabase
      .from('chai_partners')
      .select('id')
      .eq('stripe_subscription_id', subscriptionId)
      .maybeSingle();

    if (partner) {
      await supabase.from('payments').insert({
        source_type: 'chai_partner',
        source_id: partner.id,
        amount: amountDollars,
        stripe_payment_intent_id: piId,
        stripe_charge_id: null,
        status: 'succeeded',
        paid_at: new Date().toISOString(),
      });
    }
  }
}
