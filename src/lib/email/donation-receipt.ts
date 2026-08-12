import type { DedicationType } from '@/types/database';
import { receiptMethodFromDonationType } from '@/lib/donations/receipt-method';
import { buildEmailHtml, emailButton, getSiteUrl, sendEmail } from './client';
import { buildReceiptUrl, type ReceiptUrlParams } from '@/lib/donations/receipt-url';
import {
  collectRecipientEmails,
  formatCoupleNames,
  type CoupleNameInput,
} from '@/lib/donations/couple-names';

export interface DonationReceiptEmailInput extends ReceiptUrlParams {
  email: string | string[];
  firstName: string;
  /** Monthly/recurring gift — affects email copy, not receipt method label. */
  isRecurring?: boolean;
  /** Greeting after "Dear" — e.g. "Mike & Sarah". Defaults to receipt name. */
  greetingName?: string;
}

export function buildAbsoluteReceiptUrl(params: ReceiptUrlParams): string {
  return `${getSiteUrl()}${buildReceiptUrl(params)}`;
}

export function buildChaiPartnerReceiptUrl(input: {
  firstName: string;
  lastName: string;
  amount: number;
  date?: Date;
  method?: string;
  /** Override full receipt name (joint couples). */
  name?: string;
}): string {
  return buildAbsoluteReceiptUrl({
    name: (input.name || `${input.firstName} ${input.lastName}`).trim(),
    amount: input.amount,
    date: input.date,
    campaign: 'chai-partner',
    method: input.method?.trim() || 'Credit Card',
  });
}

export async function sendDonationTaxReceiptEmail(
  input: DonationReceiptEmailInput & { includeReceiptLink?: boolean }
): Promise<boolean> {
  const includeReceipt = input.includeReceiptLink !== false;
  const receiptUrl = includeReceipt ? buildAbsoluteReceiptUrl(input) : null;
  const receiptName = input.name.trim() || `${input.firstName}`.trim();
  const greeting = (input.greetingName || receiptName).trim();
  const amount = `$${input.amount.toFixed(2)}`;
  const isMonthly = input.isRecurring === true;

  const intro = includeReceipt
    ? isMonthly
      ? `Thank you for your generous monthly gift of <strong>${amount}/month</strong>. Your recurring support means the world to HaBayit. Your tax receipt for this payment is ready to view and print.`
      : `Thank you for your generous gift of <strong>${amount}</strong>. Your tax receipt is ready to view and print.`
    : isMonthly
      ? `Thank you for your generous monthly gift of <strong>${amount}/month</strong>. Your recurring support means the world to HaBayit.`
      : `Thank you for your generous gift of <strong>${amount}</strong>. We are deeply grateful for your support.`;

  const html = buildEmailHtml(`
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Dear ${greeting},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#282828;">
      ${intro}
    </p>
    ${receiptUrl ? emailButton(receiptUrl, 'View &amp; Print Tax Receipt') : ''}
  `);

  return sendEmail({
    to: input.email,
    subject: isMonthly
      ? `Thank you for your monthly gift to HaBayit — ${amount}`
      : includeReceipt
        ? `Your HaBayit tax receipt — ${amount}`
        : `Thank you for your gift to HaBayit — ${amount}`,
    html,
  });
}

export async function sendDonationReceiptEmailFromRecord(input: {
  email: string;
  firstName: string;
  lastName: string;
  amountDollars: number;
  campaign?: string | null;
  /** Optional receipt memo (only when admin entered one). */
  memo?: string | null;
  dedicationName?: string | null;
  dedicationType?: DedicationType | null;
  donationType: 'One-Time' | 'Monthly';
  /** Receipt payment-method label (Zelle, Zeffy, Credit Card, …). */
  method?: string;
  /** Actual payment time for receipt date (late entries). */
  paidAt?: string | null;
  /** When false, thank-you email omits the tax-receipt button. Default true. */
  includeReceiptLink?: boolean;
  spouseFirstName?: string | null;
  spouseLastName?: string | null;
  spouseEmail?: string | null;
}): Promise<boolean> {
  const paidDate =
    input.paidAt && !Number.isNaN(new Date(input.paidAt).getTime())
      ? new Date(input.paidAt)
      : undefined;

  const couple: CoupleNameInput = {
    firstName: input.firstName,
    lastName: input.lastName,
    spouseFirstName: input.spouseFirstName,
    spouseLastName: input.spouseLastName,
  };
  const names = formatCoupleNames(couple);
  const recipients = collectRecipientEmails(input.email, input.spouseEmail);
  if (!recipients.length) return false;

  const method =
    input.method?.trim() || receiptMethodFromDonationType(input.donationType);
  // Never push payment-method into campaign — that leaked "zelle" onto receipts.
  const campaign = input.campaign?.trim() || null;

  return sendDonationTaxReceiptEmail({
    email: recipients,
    firstName: input.firstName,
    name: names.receiptName,
    greetingName: names.greeting,
    amount: input.amountDollars,
    date: paidDate,
    campaign,
    dedicationName: input.dedicationName,
    dedicationType: input.dedicationType,
    method,
    isRecurring: input.donationType === 'Monthly',
    includeReceiptLink: input.includeReceiptLink,
  });
}
