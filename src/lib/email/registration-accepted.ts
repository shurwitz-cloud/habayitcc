import { buildEmailHtml, emailButton, getSiteUrl, sendEmail } from '@/lib/email/client';
import { HEBREW_ADVENTURE_NAME } from '@/lib/programs/names';
import { formatUsd } from '@/lib/programs/hebrew-adventure-billing';

export async function sendRegistrationAcceptedEmail(input: {
  to: string;
  parentFirstName: string;
  childNames: string[];
  amountCharged: number;
  installmentNumber: number;
  installmentTotal: number;
  upcomingInstallments: Array<{ number: number; amount: number; dueDate: string }>;
}): Promise<boolean> {
  const childList =
    input.childNames.length === 1
      ? input.childNames[0]
      : input.childNames.slice(0, -1).join(', ') + ' and ' + input.childNames.at(-1);

  const scheduleHtml =
    input.upcomingInstallments.length === 0
      ? ''
      : `<p style="margin:16px 0 8px;"><strong>Upcoming payments</strong></p>
         <ul style="margin:0;padding-left:20px;line-height:1.7;">
           ${input.upcomingInstallments
             .map(
               (i) =>
                 `<li>Payment ${i.number} of ${input.installmentTotal}: $${formatUsd(i.amount)} — due ${i.dueDate}</li>`
             )
             .join('')}
         </ul>`;

  const html = buildEmailHtml(`
    <p style="font-size:18px;color:#172643;font-weight:bold;margin:0 0 12px;">
      Registration accepted
    </p>
    <p>Hi ${input.parentFirstName},</p>
    <p>
      Great news — <strong>${childList}</strong> ${input.childNames.length === 1 ? 'is' : 'are'}
      accepted for ${HEBREW_ADVENTURE_NAME}!
    </p>
    <p>
      Payment ${input.installmentNumber} of ${input.installmentTotal}
      (<strong>$${formatUsd(input.amountCharged)}</strong>) has been submitted to your saved
      payment method. Bank (ACH) payments may take a few business days to complete.
    </p>
    ${scheduleHtml}
    <p style="margin-top:20px;">We look forward to a wonderful year together.</p>
    ${emailButton(`${getSiteUrl()}/hebrew-adventure`, 'Program details')}
  `);

  return sendEmail({
    to: input.to,
    subject: `${HEBREW_ADVENTURE_NAME} registration accepted`,
    html,
  });
}
