import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/admin/auth';
import { stripe } from '@/lib/stripe/server';
import { createAdminClient, isServiceRoleConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/stripe-donations-inspect?days=30
 * Lists recent live Stripe donation charges for admin debugging.
 */
export async function GET(req: Request) {
  if (!(await requireCapability('stripe_tools'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const days = Number(new URL(req.url).searchParams.get('days') ?? '30');
  const since = Math.floor(Date.now() / 1000) - (Number.isFinite(days) ? days : 30) * 86400;

  const hasStripe = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  const hasServiceRole = isServiceRoleConfigured();

  const oneTime: Array<Record<string, unknown>> = [];
  const monthly: Array<Record<string, unknown>> = [];

  if (hasStripe) {
    const pis = await stripe.paymentIntents.list({ limit: 100, created: { gte: since } });
    for (const pi of pis.data) {
      if (pi.status !== 'succeeded') continue;
      const m = pi.metadata ?? {};
      if (m.type === 'donation' && m.donation_type === 'one_time') {
        oneTime.push({
          id: pi.id,
          amount: pi.amount / 100,
          at: new Date(pi.created * 1000).toISOString(),
          donor: m.donor_name ?? '',
          email: m.donor_email ?? '',
        });
      }
    }

    const subs = await stripe.subscriptions.list({ limit: 100, status: 'all', created: { gte: since } });
    for (const sub of subs.data) {
      if (sub.metadata?.type !== 'monthly_donation') continue;
      const amount = (sub.items.data[0]?.price?.unit_amount ?? 0) / 100;
      monthly.push({
        subscriptionId: sub.id,
        status: sub.status,
        monthlyAmount: amount,
        donor: sub.metadata?.donor_name ?? '',
        email: sub.metadata?.donor_email ?? '',
        created: new Date(sub.created * 1000).toISOString(),
      });
    }
  }

  let crmDonations: unknown[] = [];
  let crmError: string | undefined;
  if (hasServiceRole) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('donations')
      .select('id,first_name,last_name,email,amount,stripe_payment_intent_id,created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    crmDonations = data ?? [];
    crmError = error?.message;
  }

  return NextResponse.json({
    ok: true,
    config: {
      stripeSecretKey: hasStripe,
      supabaseServiceRole: hasServiceRole,
    },
    oneTimeDonations: oneTime,
    monthlyDonations: monthly,
    crmDonations,
    crmError,
    hint: !hasServiceRole
      ? 'SUPABASE_SERVICE_ROLE_KEY is missing on Vercel — CRM writes fail even when Stripe charges succeed.'
      : undefined,
  });
}
