import type { DedicationType } from '@/types/database';
import { receiptMethodFromDonationType } from '@/lib/donations/receipt-method';
import { buildEmailHtml, emailButton, getSiteUrl, sendEmail } from './client';
import { buildReceiptUrl, type ReceiptUrlParams } from '@/lib/donations/receipt-url';

export interface DonationReceiptEmailInput extends ReceiptUrlParams {
  email: string;
  firstName: string;
  /** Monthly/recurring gift — affects email copy, not receipt method label. */
  isRecurring?: boolean;
}

export function buildAbsoluteReceiptUrl(params: ReceiptUrlParams): string {
  return `${getSiteUrl()}${buildReceiptUrl(params)}`;
}

export function buildChaiPartnerReceiptUrl(input: {
  firstName: string;
  lastName: string;
  amount: number;
  date?: Date;
}): string {
  return buildAbsoluteReceiptUrl({
    name: `${input.firstName} ${input.lastName}`.trim(),
    amount: input.amount,
    date: input.date,
    campaign: 'chai-partner',
    method: 'Credit Card',
  });
}

export async function sendDonationTaxReceiptEmail(
  input: DonationReceiptEmailInput
): Promise<boolean> {
  const receiptUrl = buildAbsoluteReceiptUrl(input);
  const name = input.name.trim() || `${input.firstName}`.trim();
  const amount = `$${input.amount.toFixed(2)}`;
  const isMonthly = input.isRecurring === true;

  const intro = isMonthly
    ? `Thank you for your generous monthly gift of <strong>${amount}/month</strong>. Your recurring support means the world to HaBayit. Your tax receipt for this payment is ready to view and print.`
    : `Thank you for your generous gift of <strong>${amount}</strong>. Your tax receipt is ready to view and print.`;

  const html = buildEmailHtml(`
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Dear ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#282828;">
      ${intro}
    </p>
    ${emailButton(receiptUrl, 'View &amp; Print Tax Receipt')}
  `);

  return sendEmail({
    to: input.email,
    subject: isMonthly
      ? `Thank you for your monthly gift to HaBayit — ${amount}`
      : `Your HaBayit tax receipt — ${amount}`,
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
  /** Receipt payment-method label (Zelle, Zeffy, Credit Card, …). */
  method?: string;
}): Promise<boolean> {
  return sendDonationTaxReceiptEmail({
    email: input.email,
    firstName: input.firstName,
    name: `${input.firstName} ${input.lastName}`.trim(),
    amount: input.amountDollars,
    campaign: input.campaign,
    dedicationName: input.dedicationName,
    dedicationType: input.dedicationType,
    method: input.method?.trim() || receiptMethodFromDonationType(input.donationType),
    isRecurring: input.donationType === 'Monthly',
  });
}
