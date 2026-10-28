import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { createAdminClient } from '@/lib/supabase/server';
import { chaiPartnerRow } from '@/lib/google/sheets';

export const dynamic = 'force-dynamic';

/**
 * Append an existing Chai partner to the Google Sheet (for missed writes).
 * POST /api/admin/chai-sheet-sync
 * Body: { confirm: true, email: string }
 */
export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;

  let body: { confirm?: boolean; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  if (body.confirm !== true) {
    return NextResponse.json({ error: 'Pass { confirm: true }.' }, { status: 400 });
  }

  const email = (body.email ?? '').trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: 'email is required.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: partner, error } = await supabase
    .from('chai_partners')
    .select(
      'id, first_name, last_name, email, phone, street_address, city, state, zip, monthly_amount, access_code, stripe_subscription_id, stripe_customer_id, created_at'
    )
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!partner) {
    return NextResponse.json({ error: 'Chai partner not found.' }, { status: 404 });
  }

  await chaiPartnerRow({
    firstName: partner.first_name || '',
    lastName: partner.last_name || '',
    email: partner.email,
    phone: partner.phone || '',
    street: partner.street_address || '',
    city: partner.city || '',
    state: partner.state || '',
    zip: partner.zip || '',
    monthlyAmount: Number(partner.monthly_amount) || 0,
    accessCode: partner.access_code || '',
    subscriptionId: partner.stripe_subscription_id || '',
    customerId: partner.stripe_customer_id || '',
  });

  return NextResponse.json({
    ok: true,
    email: partner.email,
    name: `${partner.first_name} ${partner.last_name}`.trim(),
    accessCode: partner.access_code,
  });
}
