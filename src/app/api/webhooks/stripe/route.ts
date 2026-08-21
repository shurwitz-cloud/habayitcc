import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { createAdminClient } from '@/lib/supabase/server';
import { logFormSubmission } from '@/lib/admin/form-log';
import { sendDonationReceiptEmailFromRecord } from '@/lib/email/donation-receipt';
import {
  syncDonationFromPaymentIntent,
  syncDonationFromSubscriptionInvoice,
} from '@/lib/donations/reconcile-stripe';
import {
  constructStripeWebhookEvent,
  hasStripeWebhookSecret,
} from '@/lib/stripe/webhook-verify';
import {
  paidEventInputFromPaymentIntentMetadata,
  persistPaidEventRegistration,
} from '@/lib/events/persist-paid-event-registration';
import type Stripe from 'stripe';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/webhooks/stripe',
    webhookSecretConfigured: hasStripeWebhookSecret(),
    testSecretConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET_TEST?.trim()),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig || !hasStripeWebhookSecret()) {
    return NextResponse.json({ error: 'Missing signature or webhook secret.' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = constructStripeWebhookEvent(body, sig);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  // Test-mode events often share this URL; acknowledge them but do not write to production CRM.
  if (!event.livemode) {
    return NextResponse.json({ received: true, skipped: 'test_mode' });
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
    console.error(`Error handling Stripe event ${event.type}:`, err);
  }

  return NextResponse.json({ received: true });
}

async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent) {
  const { type } = pi.metadata ?? {};

  if (type === 'paid_event_registration') {
    await handlePaidEventRegistrationPayment(pi);
    return;
  }

  if (type === 'hebrew_adventure_tuition') {
    await handleHebrewAdventureTuitionPayment(pi);
    return;
  }

  const { donation_type } = pi.metadata ?? {};
  if (type === 'donation' && donation_type === 'one_time') {
    await syncDonationFromPaymentIntent(pi, 'One-Time');
    return;
  }

  const piWithInvoice = pi as Stripe.PaymentIntent & { invoice?: string | null };
  if (piWithInvoice.invoice) {
    const invoice = await stripe.invoices.retrieve(
      typeof piWithInvoice.invoice === 'string'
        ? piWithInvoice.invoice
        : piWithInvoice.invoice,
      { expand: ['subscription'] }
    );
    const subRef = invoice.parent?.subscription_details?.subscription;
    const subscriptionId =
      typeof subRef === 'string' ? subRef : (subRef as Stripe.Subscription | null)?.id ?? null;
    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      if (subscription.metadata?.type === 'monthly_donation') {
        await syncDonationFromSubscriptionInvoice(invoice, subscription);
      }
    }
  }
}

async function handlePaidEventRegistrationPayment(pi: Stripe.PaymentIntent) {
  const meta = (pi.metadata ?? {}) as Record<string, string>;
  const input = paidEventInputFromPaymentIntentMetadata(meta, pi.id);
  if (!input) {
    console.error('[stripe webhook] paid_event_registration missing metadata', pi.id);
    return;
  }

  const result = await persistPaidEventRegistration(input);
  if (!result.success) {
    console.error('[stripe webhook] paid event persist failed', pi.id, result.error);
  } else if (result.alreadyExisted) {
    console.info('[stripe webhook] paid event already registered', pi.id, result.registrationId);
  } else {
    console.info('[stripe webhook] paid event registered from webhook', pi.id, result.registrationId);
  }
}

async function handleHebrewAdventureTuitionPayment(pi: Stripe.PaymentIntent) {
  const supabase = createAdminClient();
  const installment = pi.metadata?.installment;
  const familyId = pi.metadata?.family_id;

  if (!installment || !familyId) return;

  const amountDollars = pi.amount / 100;
  const paidAt = new Date().toISOString();

  await supabase
    .from('tuition_installments')
    .update({
      status: 'paid',
      stripe_payment_intent_id: pi.id,
      paid_at: paidAt,
    })
    .eq('family_id', familyId)
    .eq('installment_number', parseInt(installment, 10));

  const { data: payments } = await supabase
    .from('payments')
    .select('id')
    .eq('stripe_payment_intent_id', pi.id);

  if (payments?.length) return;

  const { data: reg } = await supabase
    .from('program_registrations')
    .select('id')
    .eq('family_id', familyId)
    .limit(1)
    .maybeSingle();

  if (reg) {
    await supabase.from('payments').insert({
      source_type: 'program_registration',
      source_id: reg.id,
      amount: amountDollars,
      stripe_payment_intent_id: pi.id,
      stripe_charge_id: typeof pi.latest_charge === 'string' ? pi.latest_charge : null,
      status: 'succeeded',
      paid_at: paidAt,
    });

    void logFormSubmission({
      formType: 'hebrew_adventure_registration',
      email: pi.metadata?.donor_email,
      sourceId: reg.id,
      payload: {
        type: 'tuition_payment',
        paymentIntentId: pi.id,
        familyId,
        installment,
        amountDollars,
      },
    });
  }
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const subRef = invoice.parent?.subscription_details?.subscription;
  const subscriptionId =
    typeof subRef === 'string' ? subRef : (subRef as Stripe.Subscription | null)?.id ?? null;

  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const { type } = subscription.metadata ?? {};

  if (type === 'monthly_donation') {
    await syncDonationFromSubscriptionInvoice(invoice, subscription);
    return;
  }

  if (type === 'chai_partner' && invoice.billing_reason !== 'subscription_create') {
    await handleChaiPartnerRenewal(invoice, subscription);
  }
}

async function handleChaiPartnerRenewal(
  invoice: Stripe.Invoice,
  subscription: Stripe.Subscription
) {
  const supabase = createAdminClient();
  const amountDollars = invoice.amount_paid / 100;
  const piId = invoice.confirmation_secret?.client_secret?.split('_secret_')[0] ?? null;
  const { donor_email, donor_name } = subscription.metadata ?? {};
  const [firstName, ...rest] = (donor_name ?? '').split(' ');
  const lastName = rest.join(' ');

  const { data: partner } = await supabase
    .from('chai_partners')
    .select('id, first_name, last_name, email')
    .eq('stripe_subscription_id', subscription.id)
    .maybeSingle();

  if (!partner) return;

  await supabase.from('payments').insert({
    source_type: 'chai_partner',
    source_id: partner.id,
    amount: amountDollars,
    stripe_payment_intent_id: piId,
    stripe_charge_id: null,
    status: 'succeeded',
    paid_at: new Date().toISOString(),
  });

  void logFormSubmission({
    formType: 'chai_partner',
    email: partner.email || donor_email,
    sourceId: partner.id,
    payload: {
      type: 'renewal',
      subscriptionId: subscription.id,
      invoiceId: invoice.id,
      amountDollars,
      paymentIntentId: piId,
    },
  });

  await sendDonationReceiptEmailFromRecord({
    email: partner.email || donor_email,
    firstName: partner.first_name || firstName || '',
    lastName: partner.last_name || lastName || '',
    amountDollars,
    campaign: 'chai-partner',
    donationType: 'Monthly',
  });
}
