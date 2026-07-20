import { buildEmailHtml, getAdminEmail, sendEmail } from './client';

export async function sendDonationAdminNotification(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  amountDollars: number;
  donationType: 'One-Time' | 'Monthly';
  paymentIntentId?: string | null;
  campaign?: string | null;
  memo?: string | null;
}): Promise<boolean> {
  const name = `${input.firstName} ${input.lastName}`.trim();
  const amount = `$${input.amountDollars.toFixed(2)}`;
  const frequency = input.donationType === 'Monthly' ? `${amount}/month` : amount;

  const html = buildEmailHtml(`
    <p style="margin:0 0 12px;font-size:16px;color:#172643;font-weight:bold;">
      New ${input.donationType === 'Monthly' ? 'monthly ' : ''}donation received
    </p>
    <p style="margin:0;font-size:14px;line-height:1.7;">
      <strong>${name}</strong><br>
      Email: ${input.email}<br>
      Phone: ${input.phone?.trim() || '—'}<br>
      Amount: <strong>${frequency}</strong><br>
      Type: ${input.donationType}<br>
      ${input.campaign ? `Campaign: ${input.campaign}<br>` : ''}
      ${input.memo ? `Memo: ${input.memo}<br>` : ''}
      ${input.paymentIntentId ? `Stripe PI: ${input.paymentIntentId}<br>` : ''}
    </p>
    <p style="margin:16px 0 0;font-size:13px;color:#6f6a60;">
      View in CRM: <a href="https://www.habayitcc.org/admin/crm" style="color:#172643;">admin/crm → Donations</a>
    </p>
  `);

  return sendEmail({
    to: getAdminEmail(),
    subject: `New donation — ${name} (${frequency})`,
    replyTo: input.email,
    html,
  });
}
