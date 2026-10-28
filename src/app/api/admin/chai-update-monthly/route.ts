import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Update a Chai partner's monthly rate (no payment recorded).
 * POST /api/admin/chai-update-monthly
 */
export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;

  let body: {
    confirm?: boolean;
    partnerId?: string;
    monthlyAmount?: number;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  if (body.confirm !== true) {
    return NextResponse.json({ error: 'Pass { confirm: true }.' }, { status: 400 });
  }

  const partnerId = (body.partnerId ?? '').trim();
  const monthlyAmount = Number(body.monthlyAmount);
  if (!partnerId) {
    return NextResponse.json({ error: 'partnerId is required.' }, { status: 400 });
  }
  if (!Number.isFinite(monthlyAmount) || monthlyAmount < 150) {
    return NextResponse.json(
      { error: 'monthlyAmount must be at least $150.' },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { data: partner, error: findError } = await supabase
    .from('chai_partners')
    .select('id, first_name, last_name, email, monthly_amount')
    .eq('id', partnerId)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }
  if (!partner) {
    return NextResponse.json({ error: 'Chai partner not found.' }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from('chai_partners')
    .update({
      monthly_amount: monthlyAmount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', partnerId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    partnerId,
    email: partner.email,
    previousMonthly: Number(partner.monthly_amount),
    monthlyAmount,
  });
}
