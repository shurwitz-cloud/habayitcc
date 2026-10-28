import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { buildEmailHtml, emailButton, getFromEmail, getResend, getSiteUrl } from '@/lib/email/client';
import { getShvilyInvoice, shvilyAmountDue } from '@/lib/invoice/shvily-invoice';

export const dynamic = 'force-dynamic';

/**
 * Send the Hebrew Adventure family invoice email (HTML with gold button).
 * Personal details come from SHVILY_INVOICE_JSON (server env), never from the repo.
 * POST /api/admin/email/send-shvily-invoice
 * Body: { confirm: true, to?: string }
 */
export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('emails');
  if (denied) return denied;

  let body: { confirm?: boolean; to?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  if (body.confirm !== true) {
    return NextResponse.json({ error: 'Pass { confirm: true }.' }, { status: 400 });
  }

  const invoice = getShvilyInvoice();
  if (!invoice) {
    return NextResponse.json({ error: 'Invoice is not configured.' }, { status: 503 });
  }

  const to = (body.to ?? invoice.emailTo).trim().toLowerCase();
  if (!to.includes('@')) {
    return NextResponse.json({ error: 'Invalid to address.' }, { status: 400 });
  }

  const resend = getResend();
  if (!resend) {
    return NextResponse.json({ error: 'RESEND_API_KEY is not configured.' }, { status: 503 });
  }

  // Prefer .org for family-facing links.
  const invoiceUrl = `${getSiteUrl()}/invoice/hebrew-adventure/shvily`;
  const amountDue = shvilyAmountDue(invoice).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
  const html = buildEmailHtml(`
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Dear ${invoice.salutation},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#282828;">
      Hope ${invoice.childNames} are enjoying Hebrew Adventure.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#282828;">
      As requested, here is your invoice for the ${invoice.term} term:
    </p>
    ${emailButton(invoiceUrl, 'View invoice')}
    <p style="margin:20px 0 16px;font-size:15px;line-height:1.6;color:#282828;">
      Amount due by ${invoice.dueDate}: <strong>${amountDue}</strong><br>
      <span style="color:#6f6a60;font-size:14px;">(${invoice.cardFeeNote})</span>
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#282828;">
      Please include your family name and “Hebrew Adventure” in the payment memo.
    </p>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#282828;">
      Warmly,<br>
      HaBayit Hebrew Adventure
    </p>
  `);

  try {
    const { error } = await resend.emails.send({
      from: `HaBayit Jewish Center <${getFromEmail()}>`,
      to: [to],
      subject: 'Hebrew Adventure invoice — HaBayit',
      html,
      replyTo: getFromEmail(),
    });
    if (error) {
      return NextResponse.json({ error: error.message || 'Send failed.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, to });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
