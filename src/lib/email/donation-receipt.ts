import type { DedicationType } from '@/types/database';
import { buildEmailHtml, emailButton, getSiteUrl, sendEmail } from './client';
import { buildReceiptUrl, type ReceiptUrlParams } from '@/lib/donations/receipt-url';

export interface DonationReceiptEmailInput extends ReceiptUrlParams {
  email: string;
  firstName: string;
}

export function buildAbsoluteReceiptUrl(params: ReceiptUrlParams): string {
  return `${getSiteUrl()}${buildReceiptUrl(params)}`;
}

export async function sendDonationTaxReceiptEmail(
  input: DonationReceiptEmailInput
): Promise<boolean> {
  const receiptUrl = buildAbsoluteReceiptUrl(input);
  const name = input.name.trim() || `${input.firstName}`.trim();
  const amount = `$${input.amount.toFixed(2)}`;

  const html = buildEmailHtml(`
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Dear ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#282828;">
      Thank you for your generous gift of <strong>${amount}</strong>.
      Your tax receipt is ready to view and print.
    </p>
    ${emailButton(receiptUrl, 'View &amp; Print Tax Receipt')}
    <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#6f6a60;">
      You can also save this link for your records:<br>
      <a href="${receiptUrl}" style="color:#172643;word-break:break-all;">${receiptUrl}</a>
    </p>
  `);

  return sendEmail({
    to: input.email,
    subject: `Your HaBayit tax receipt — ${amount}`,
    html,
  });
}

export async function sendDonationReceiptEmailFromRecord(input: {
  email: string;
  firstName: string;
  lastName: string;
  amountDollars: number;
  campaign?: string | null;
  dedicationName?: string | null;
  dedicationType?: DedicationType | null;
  donationType: 'One-Time' | 'Monthly';
}): Promise<boolean> {
  return sendDonationTaxReceiptEmail({
    email: input.email,
    firstName: input.firstName,
    name: `${input.firstName} ${input.lastName}`.trim(),
    amount: input.amountDollars,
    campaign: input.campaign,
    dedicationName: input.dedicationName,
    dedicationType: input.dedicationType,
    method: input.donationType === 'Monthly' ? 'Credit Card (Monthly)' : 'Credit Card',
  });
}
