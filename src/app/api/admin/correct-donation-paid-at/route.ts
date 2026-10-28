import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { createAdminClient } from '@/lib/supabase/server';
import {
  buildAbsoluteReceiptUrl,
  buildChaiPartnerReceiptUrl,
} from '@/lib/email/donation-receipt';
import { receiptMethodFromDonationType } from '@/lib/donations/receipt-method';

export const dynamic = 'force-dynamic';

/**
 * Quietly backdate paid_at and return a corrected receipt URL.
 * Never sends email.
 *
 * GET  ?email=… — diagnose donations + chai partner payments
 * POST { confirm, email, paidAt?, amount?, donationId?, partnerId?, method? }
 *      If paidAt omitted, uses existing payments.paid_at when present.
 */
export async function GET(req: NextRequest) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;

  const email = (req.nextUrl.searchParams.get('email') || '').trim().toLowerCase();
  if (!email.includes('@')) {
    return NextResponse.json({ error: 'email required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: donations } = await supabase
    .from('donations')
    .select(
      'id, first_name, last_name, email, amount, memo, campaign, donation_type, created_at, stripe_payment_intent_id',
    )
    .ilike('email', email)
    .order('created_at', { ascending: false })
    .limit(20);

  const { data: partners } = await supabase
    .from('chai_partners')
    .select('id, first_name, last_name, email, monthly_amount, status, created_at')
    .ilike('email', email);

  const donationIds = (donations || []).map((d) => d.id);
  const partnerIds = (partners || []).map((p) => p.id);

  const paymentQueries = [];
  if (donationIds.length) {
    paymentQueries.push(
      supabase
        .from('payments')
        .select('id, source_type, source_id, amount, paid_at, created_at, status, stripe_payment_intent_id')
        .eq('source_type', 'donation')
        .in('source_id', donationIds),
    );
  }
  if (partnerIds.length) {
    paymentQueries.push(
      supabase
        .from('payments')
        .select('id, source_type, source_id, amount, paid_at, created_at, status, stripe_payment_intent_id')
        .eq('source_type', 'chai_partner')
        .in('source_id', partnerIds),
    );
  }

  const paymentResults = await Promise.all(paymentQueries);
  const payments = paymentResults.flatMap((r) => r.data || []);

  const { data: forms } = await supabase
    .from('form_submissions')
    .select('form_type, created_at, payload')
    .ilike('email', email)
    .order('created_at', { ascending: false })
    .limit(15);

  let correctedReceiptUrl: string | null = null;
  if (req.nextUrl.searchParams.get('receipt') === '1') {
    const partner = (partners || [])[0];
    const chaiPay = payments
      .filter((p) => p.source_type === 'chai_partner')
      .sort((a, b) => String(a.paid_at).localeCompare(String(b.paid_at)))[0];
    if (partner && chaiPay?.paid_at) {
      correctedReceiptUrl = buildChaiPartnerReceiptUrl({
        firstName: partner.first_name,
        lastName: partner.last_name,
        amount: Number(chaiPay.amount ?? partner.monthly_amount),
        date: new Date(chaiPay.paid_at),
      });
    }
  }

  return NextResponse.json({
    donations: donations || [],
    partners: partners || [],
    payments,
    forms: (forms || []).map((f) => ({
      form_type: f.form_type,
      created_at: f.created_at,
      payload: f.payload,
    })),
    correctedReceiptUrl,
    emailsSent: false,
  });
}

export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;

  let body: {
    confirm?: boolean;
    email?: string;
    amount?: number;
    paidAt?: string;
    donationId?: string;
    partnerId?: string;
    method?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.confirm !== true) {
    return NextResponse.json({ error: 'Pass { confirm: true }' }, { status: 400 });
  }

  const email = (body.email || '').trim().toLowerCase();
  if (!email.includes('@')) {
    return NextResponse.json({ error: 'email required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Prefer chai partner when partnerId given or only partner exists for this email.
  let partner: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    monthly_amount: number;
  } | null = null;

  if (body.partnerId) {
    const { data } = await supabase
      .from('chai_partners')
      .select('id, first_name, last_name, email, monthly_amount')
      .eq('id', body.partnerId)
      .maybeSingle();
    partner = data;
  } else if (!body.donationId) {
    const { data } = await supabase
      .from('chai_partners')
      .select('id, first_name, last_name, email, monthly_amount')
      .ilike('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    partner = data;
  }

  if (partner) {
    const { data: pay } = await supabase
      .from('payments')
      .select('id, paid_at, amount')
      .eq('source_type', 'chai_partner')
      .eq('source_id', partner.id)
      .order('paid_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const paidAtRaw = (body.paidAt || pay?.paid_at || '').trim();
    if (!paidAtRaw) {
      return NextResponse.json(
        { error: 'paidAt required (CRM payment has no paid_at either)' },
        { status: 400 },
      );
    }
    const paidAtDate = new Date(paidAtRaw);
    if (Number.isNaN(paidAtDate.getTime())) {
      return NextResponse.json({ error: 'Invalid paidAt' }, { status: 400 });
    }
    const paidAt = paidAtDate.toISOString();

    if (body.paidAt) {
      await supabase.from('chai_partners').update({ created_at: paidAt }).eq('id', partner.id);
      await supabase
        .from('payments')
        .update({ paid_at: paidAt })
        .eq('source_type', 'chai_partner')
        .eq('source_id', partner.id);
    }

    const amount = Number(body.amount ?? pay?.amount ?? partner.monthly_amount);
    const receiptUrl = buildChaiPartnerReceiptUrl({
      firstName: partner.first_name,
      lastName: partner.last_name,
      amount,
      date: paidAtDate,
    });

    return NextResponse.json({
      success: true,
      emailsSent: false,
      kind: 'chai_partner',
      partnerId: partner.id,
      paidAt,
      receiptUrl,
    });
  }

  let donation: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    amount: number;
    campaign: string | null;
    donation_type: string | null;
    memo: string | null;
  } | null = null;

  if (body.donationId) {
    const { data } = await supabase
      .from('donations')
      .select('id, first_name, last_name, email, amount, campaign, donation_type, memo')
      .eq('id', body.donationId)
      .maybeSingle();
    donation = data;
  } else {
    let q = supabase
      .from('donations')
      .select('id, first_name, last_name, email, amount, campaign, donation_type, memo')
      .ilike('email', email)
      .order('created_at', { ascending: false })
      .limit(5);
    if (typeof body.amount === 'number') {
      q = q.eq('amount', body.amount);
    }
    const { data } = await q;
    donation = data?.[0] ?? null;
  }

  if (!donation) {
    return NextResponse.json({ error: 'Donation / partner not found' }, { status: 404 });
  }

  const { data: pay } = await supabase
    .from('payments')
    .select('id, paid_at')
    .eq('source_type', 'donation')
    .eq('source_id', donation.id)
    .order('paid_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const paidAtRaw = (body.paidAt || pay?.paid_at || '').trim();
  if (!paidAtRaw) {
    return NextResponse.json({ error: 'paidAt required' }, { status: 400 });
  }
  const paidAtDate = new Date(paidAtRaw);
  if (Number.isNaN(paidAtDate.getTime())) {
    return NextResponse.json({ error: 'Invalid paidAt' }, { status: 400 });
  }
  const paidAt = paidAtDate.toISOString();

  if (body.paidAt) {
    await supabase.from('donations').update({ created_at: paidAt }).eq('id', donation.id);
    await supabase
      .from('payments')
      .update({ paid_at: paidAt })
      .eq('source_type', 'donation')
      .eq('source_id', donation.id);
  }

  const method =
    (body.method || '').trim() ||
    (donation.memo?.match(/via\s+([^·]+)/i)?.[1]?.trim() ??
      receiptMethodFromDonationType(
        donation.donation_type === 'Monthly' ? 'Monthly' : 'One-Time',
      ));

  const receiptUrl = buildAbsoluteReceiptUrl({
    name: `${donation.first_name} ${donation.last_name}`.trim(),
    amount: Number(donation.amount),
    date: paidAtDate,
    campaign: donation.campaign,
    method,
  });

  return NextResponse.json({
    success: true,
    emailsSent: false,
    kind: 'donation',
    donationId: donation.id,
    paidAt,
    receiptUrl,
  });
}
