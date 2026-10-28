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
  input: DonationReceiptEmailInput & {
    includeReceiptLink?: boolean;
    /**
     * Chai / recurring rate when `amount` is this payment (may cover multiple months).
     * Prevents "$600/month" when someone prepaid $600 at $150/mo.
     */
    monthlyAmount?: number;
    /** Months this payment covers (for copy only). */
    coverageMonths?: number;
  }
): Promise<boolean> {
  const includeReceipt = input.includeReceiptLink !== false;
  const receiptUrl = includeReceipt ? buildAbsoluteReceiptUrl(input) : null;
  const receiptName = input.name.trim() || `${input.firstName}`.trim();
  const greeting = (input.greetingName || receiptName).trim();
  const amount = `$${input.amount.toFixed(2)}`;
  const coverageMonths =
    Number.isFinite(input.coverageMonths) && Number(input.coverageMonths) >= 1
      ? Math.floor(Number(input.coverageMonths))
      : 1;
  const monthlyRate =
    Number.isFinite(input.monthlyAmount) && Number(input.monthlyAmount) > 0
      ? Number(input.monthlyAmount)
      : null;
  const paymentIsMultiMonth =
    coverageMonths > 1 ||
    (monthlyRate != null && Math.abs(input.amount - monthlyRate) > 0.02);
  // True "monthly gift of $X/month" only when this charge equals one month.
  const isMonthly = input.isRecurring === true && !paymentIsMultiMonth;
  const monthlyLabel =
    monthlyRate != null ? `$${monthlyRate.toFixed(2)}` : amount;

  const giftLine = isMonthly
    ? `Your generous monthly gift of <strong>${monthlyLabel}/month</strong> means so much to us. Your ongoing partnership gives HaBayit the strength to keep growing and serving our community month after month.`
    : paymentIsMultiMonth && monthlyRate != null
      ? `Your generous gift of <strong>${amount}</strong> means so much to us. It covers <strong>${coverageMonths} month${coverageMonths === 1 ? '' : 's'}</strong> of your <strong>${monthlyLabel}/month</strong> partnership, giving HaBayit the strength to keep growing and serving our community.`
      : `Your generous gift of <strong>${amount}</strong> means so much to us.`;

  const receiptLine = includeReceipt
    ? `Your tax receipt${isMonthly ? ' for this month&apos;s gift' : ' for this gift'} is ready to view and print below.`
    : '';

  const html = buildEmailHtml(`
    <p style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.35;color:#172643;font-weight:bold;">
      Thank you for strengthening Jewish life at HaBayit
    </p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Dear ${greeting},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#282828;">
      ${giftLine}
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#282828;">
      Because of you, HaBayit can continue to be a warm Jewish home where families connect,
      children learn, and our community celebrates, grows, and belongs together.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#282828;">
      We are deeply grateful that you chose to be part of what we are building.
    </p>
    ${receiptLine ? `<p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#6f6a60;">${receiptLine}</p>` : ''}
    ${receiptUrl ? emailButton(receiptUrl, 'View &amp; Print Tax Receipt') : ''}
    <p style="margin:24px 0 0;font-size:15px;line-height:1.7;color:#282828;">
      With heartfelt appreciation,<br>
      <strong style="color:#172643;">Rabbi Shmuly &amp; Devora</strong>
    </p>
  `);

  return sendEmail({
    to: input.email,
    subject: isMonthly
      ? `Thank you for your monthly support of HaBayit — ${amount}`
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
  /** Partner monthly rate when amountDollars is a prepaid / multi-month payment. */
  monthlyAmount?: number;
  coverageMonths?: number;
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
    monthlyAmount: input.monthlyAmount,
    coverageMonths: input.coverageMonths,
  });
}
