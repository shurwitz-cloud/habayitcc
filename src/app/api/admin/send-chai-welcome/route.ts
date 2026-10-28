import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { createAdminClient } from '@/lib/supabase/server';
import { sendChaiPartnerWelcomeEmail } from '@/lib/email/chai-partner-welcome';
import { buildChaiPartnerReceiptUrl } from '@/lib/email/donation-receipt';
import { ensureCrmContact } from '@/lib/admin/ensure-contact';

export const dynamic = 'force-dynamic';

/**
 * Send (or resend) Chai Partner welcome email for an existing partner.
 * POST /api/admin/send-chai-welcome
 */
export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;

  let body: {
    confirm?: boolean;
    email?: string;
    includeReceiptLink?: boolean;
    nextStepsLine?: string;
    paidUpfront?: boolean;
    paidAmount?: number;
    spouseFirstName?: string;
    spouseLastName?: string;
    spouseEmail?: string;
    /** Tax receipt “Name” line (business / donor of record). */
    receiptName?: string;
    /** “Dear …” line; defaults to partner personal name. */
    greetingName?: string;
    paymentMethod?: string;
    paidAt?: string;
    /** Persist receiptName on the contact note for future reference. */
    saveReceiptName?: boolean;
  };
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
    .select('id, first_name, last_name, email, phone, monthly_amount, access_code')
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!partner?.access_code) {
    return NextResponse.json({ error: 'Chai partner not found (or missing access code).' }, { status: 404 });
  }

  const monthlyAmount = Number(partner.monthly_amount) || 150;
  const includeReceipt = body.includeReceiptLink === true;
  const paidUpfront = body.paidUpfront === true;
  const receiptLegalName = (body.receiptName ?? '').trim();
  const greetingName =
    (body.greetingName ?? '').trim() ||
    `${partner.first_name || ''} ${partner.last_name || ''}`.trim();
  const receiptAmount =
    paidUpfront && body.paidAmount
      ? Number(body.paidAmount)
      : Number.isFinite(body.paidAmount) && Number(body.paidAmount) > 0
        ? Number(body.paidAmount)
        : monthlyAmount;
  const paidAt = body.paidAt ? new Date(body.paidAt) : undefined;
  const paymentMethod = (body.paymentMethod ?? '').trim() || 'Credit Card';

  if (body.saveReceiptName === true && receiptLegalName) {
    await ensureCrmContact({
      firstName: partner.first_name || 'Member',
      lastName: partner.last_name || '',
      email: partner.email,
      phone: partner.phone,
      interest: 'Chai Partner',
      note: `Tax receipt name: ${receiptLegalName}`,
      isResolved: true,
    });
  }

  const sent = await sendChaiPartnerWelcomeEmail({
    firstName: partner.first_name || '',
    lastName: partner.last_name || '',
    email: partner.email,
    phone: partner.phone || '',
    monthlyAmount,
    accessCode: partner.access_code,
    spouseFirstName: (body.spouseFirstName ?? '').trim() || undefined,
    spouseLastName: (body.spouseLastName ?? '').trim() || undefined,
    spouseEmail: (body.spouseEmail ?? '').trim() || undefined,
    paidUpfront,
    paidAmount: body.paidAmount,
    nextStepsLine: body.nextStepsLine,
    greetingName,
    receiptUrl: includeReceipt
      ? buildChaiPartnerReceiptUrl({
          firstName: partner.first_name || '',
          lastName: partner.last_name || '',
          amount: receiptAmount,
          date: paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt : undefined,
          method: paymentMethod,
          name: receiptLegalName || undefined,
        })
      : undefined,
  });

  if (!sent) {
    return NextResponse.json({ error: 'Failed to send welcome email.' }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    emailed: true,
    email: partner.email,
    accessCode: partner.access_code,
    greetingName,
    receiptName: receiptLegalName || `${partner.first_name} ${partner.last_name}`.trim(),
    receiptAmount,
  });
}
