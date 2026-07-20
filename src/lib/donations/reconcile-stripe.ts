import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe/server';
import { persistDonation } from '@/lib/donations/persist-donation';
import { sendDonationReceiptEmailFromRecord } from '@/lib/email/donation-receipt';
import { sendDonationAdminNotification } from '@/lib/email/donation-admin';

function splitDonorName(donorName?: string) {
  const [firstName, ...rest] = (donorName ?? '').split(' ');
  return { firstName: firstName ?? '', lastName: rest.join(' ') };
}

function dedicationTypeFromMeta(
  value?: string
): 'honor' | 'memory' | null {
  return value === 'honor' || value === 'memory' ? value : null;
}

export async function syncDonationFromPaymentIntent(
  pi: Stripe.PaymentIntent,
  donationType: 'One-Time' | 'Monthly'
): Promise<{ saved: boolean; alreadyExisted: boolean; error?: string }> {
  const meta = pi.metadata ?? {};
  const { firstName, lastName } = splitDonorName(meta.donor_name);
  const email = meta.donor_email ?? '';
  const amountDollars = pi.amount / 100;
  const chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : null;

  const persisted = await persistDonation({
    paymentIntentId: pi.id,
    amountDollars,
    firstName,
    lastName,
    email,
    phone: null,
    donationType,
    memo: meta.memo || null,
    campaign: meta.campaign || null,
    dedicationName: meta.dedication_name || null,
    dedicationType: dedicationTypeFromMeta(meta.dedication_type),
    stripeChargeId: chargeId,
  });

  if (persisted.saved && !persisted.alreadyExisted && email) {
    await Promise.all([
      sendDonationReceiptEmailFromRecord({
        email,
        firstName,
        lastName,
        amountDollars,
        campaign: meta.campaign || null,
        dedicationName: meta.dedication_name || null,
        dedicationType: dedicationTypeFromMeta(meta.dedication_type),
        donationType,
      }),
      sendDonationAdminNotification({
        firstName,
        lastName,
        email,
        amountDollars,
        donationType,
        paymentIntentId: pi.id,
        campaign: meta.campaign || null,
        memo: meta.memo || null,
      }),
    ]);
  }

  return {
    saved: persisted.saved,
    alreadyExisted: persisted.alreadyExisted,
    error: persisted.error,
  };
}

export async function syncDonationFromSubscriptionInvoice(
  invoice: Stripe.Invoice,
  subscription: Stripe.Subscription
): Promise<{ saved: boolean; alreadyExisted: boolean; error?: string }> {
  const meta = subscription.metadata ?? {};
  const { firstName, lastName } = splitDonorName(meta.donor_name);
  const email = meta.donor_email ?? '';
  const amountDollars = invoice.amount_paid / 100;

  const piId =
    invoice.confirmation_secret?.client_secret?.split('_secret_')[0] ?? null;

  const persisted = await persistDonation({
    paymentIntentId: piId,
    amountDollars,
    firstName,
    lastName,
    email,
    phone: null,
    donationType: 'Monthly',
    memo: meta.memo || null,
    campaign: meta.campaign || null,
    dedicationName: meta.dedication_name || null,
    dedicationType: dedicationTypeFromMeta(meta.dedication_type),
  });

  if (persisted.saved && !persisted.alreadyExisted && email) {
    await Promise.all([
      sendDonationReceiptEmailFromRecord({
        email,
        firstName,
        lastName,
        amountDollars,
        campaign: meta.campaign || null,
        dedicationName: meta.dedication_name || null,
        dedicationType: dedicationTypeFromMeta(meta.dedication_type),
        donationType: 'Monthly',
      }),
      sendDonationAdminNotification({
        firstName,
        lastName,
        email,
        amountDollars,
        donationType: 'Monthly',
        paymentIntentId: piId,
        campaign: meta.campaign || null,
        memo: meta.memo || null,
      }),
    ]);
  }

  return {
    saved: persisted.saved,
    alreadyExisted: persisted.alreadyExisted,
    error: persisted.error,
  };
}

export async function reconcileStripeDonations(days = 30): Promise<{
  scanned: number;
  imported: number;
  skipped: number;
  failed: number;
  items: Array<{
    id: string;
    amount: number;
    email: string;
    type: 'One-Time' | 'Monthly';
    status: 'imported' | 'skipped' | 'failed';
    note?: string;
  }>;
}> {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const items: Array<{
    id: string;
    amount: number;
    email: string;
    type: 'One-Time' | 'Monthly';
    status: 'imported' | 'skipped' | 'failed';
    note?: string;
  }> = [];

  let scanned = 0;
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  const pis = await stripe.paymentIntents.list({ limit: 100, created: { gte: since } });
  for (const pi of pis.data) {
    if (pi.status !== 'succeeded') continue;
    const meta = pi.metadata ?? {};
    if (meta.type === 'donation' && meta.donation_type === 'one_time') {
      scanned += 1;
      const result = await syncDonationFromPaymentIntent(pi, 'One-Time');
      const status = result.saved
        ? result.alreadyExisted
          ? 'skipped'
          : 'imported'
        : 'failed';
      if (status === 'imported') imported += 1;
      else if (status === 'skipped') skipped += 1;
      else failed += 1;
      items.push({
        id: pi.id,
        amount: pi.amount / 100,
        email: meta.donor_email ?? '',
        type: 'One-Time',
        status,
        note: result.saved ? undefined : result.error ?? 'CRM save failed',
      });
    }
  }

  const subs = await stripe.subscriptions.list({ limit: 100, status: 'all', created: { gte: since } });
  for (const sub of subs.data) {
    if (sub.metadata?.type !== 'monthly_donation') continue;

    const invoices = await stripe.invoices.list({
      subscription: sub.id,
      limit: 12,
      status: 'paid',
    });

    for (const invoice of invoices.data) {
      scanned += 1;
      const result = await syncDonationFromSubscriptionInvoice(invoice, sub);
      const status = result.saved
        ? result.alreadyExisted
          ? 'skipped'
          : 'imported'
        : 'failed';
      if (status === 'imported') imported += 1;
      else if (status === 'skipped') skipped += 1;
      else failed += 1;
      items.push({
        id: invoice.id,
        amount: invoice.amount_paid / 100,
        email: sub.metadata?.donor_email ?? '',
        type: 'Monthly',
        status,
        note: result.saved ? undefined : result.error ?? 'CRM save failed',
      });
    }
  }

  return { scanned, imported, skipped, failed, items };
}
