import 'server-only';

import { createHmac, timingSafeEqual } from 'crypto';
import type { DedicationType } from '@/types/database';
import {
  DEFAULT_DONATION_MEMO,
  formatReceiptMemo,
  isPaymentMethodCampaign,
  resolveDonationMemo,
} from './memo';

export interface ReceiptUrlParams {
  name: string;
  amount: number;
  date?: Date;
  campaign?: string | null;
  /** Explicit donation memo for the receipt (optional). */
  memo?: string | null;
  dedicationName?: string | null;
  dedicationType?: DedicationType | null;
  method?: string;
}

const RECEIPT_SIG_PARAM = 'sig';

function getReceiptSigningSecret(): string | undefined {
  return (
    process.env.RECEIPT_SIGNING_SECRET?.trim() ||
    process.env.ADMIN_SECRET?.trim() ||
    undefined
  );
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function formatReceiptDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function canonicalReceiptPayload(params: {
  name: string;
  amount: string;
  date: string;
  method: string;
  campaign?: string;
  dedication?: string;
  dedicationType?: string;
  memo?: string;
}): string {
  const parts = [
    `amount=${params.amount}`,
    `campaign=${params.campaign ?? ''}`,
    `date=${params.date}`,
    `dedication=${params.dedication ?? ''}`,
    `dedicationType=${params.dedicationType ?? ''}`,
    `memo=${params.memo ?? ''}`,
    `method=${params.method}`,
    `name=${params.name}`,
  ];
  return parts.join('\n');
}

function signReceiptPayload(payload: string): string {
  const secret = getReceiptSigningSecret();
  if (!secret) return '';
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function readReceiptParam(
  value: string | string[] | undefined
): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw?.trim()) return undefined;
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' ')).trim();
  } catch {
    return raw.trim();
  }
}

export function resolveReceiptMemoFromParams(params: {
  campaign?: string;
  dedication?: string;
  dedicationType?: string;
  /** @deprecated legacy pre-formatted memo links */
  memo?: string;
  /** Payment method — used so Zelle/etc. gifts without a real memo stay blank. */
  method?: string;
}): string {
  const rawCampaign = params.campaign?.trim();
  // Ignore payment-method "campaigns" (e.g. campaign=zelle) — Method column already shows that.
  const campaign =
    rawCampaign && !isPaymentMethodCampaign(rawCampaign) ? rawCampaign : undefined;
  const dedicationName = params.dedication?.trim();
  const dedicationType =
    params.dedicationType === 'honor' || params.dedicationType === 'memory'
      ? params.dedicationType
      : null;

  if (campaign || dedicationName) {
    return formatReceiptMemo(resolveDonationMemo(campaign ?? null), {
      name: dedicationName,
      type: dedicationType,
    });
  }

  if (params.memo?.trim()) return params.memo.trim();

  // Manual/offline gifts: empty memo stays empty (don't invent "zelle" or "General Donation").
  if (
    (rawCampaign && isPaymentMethodCampaign(rawCampaign)) ||
    isPaymentMethodCampaign(params.method)
  ) {
    return '';
  }

  return DEFAULT_DONATION_MEMO;
}

export function buildReceiptUrl(params: ReceiptUrlParams): string {
  const date = params.date ?? new Date();
  const dateStr = formatReceiptDate(date);
  const method = params.method ?? 'Credit Card';
  const amountStr = params.amount.toFixed(2);

  const search = new URLSearchParams({
    name: params.name,
    amount: amountStr,
    date: dateStr,
    method,
  });

  const campaign = params.campaign?.trim();
  if (campaign && !isPaymentMethodCampaign(campaign)) {
    search.set('campaign', campaign);
  }

  const memo = params.memo?.trim();
  if (memo) search.set('memo', memo);

  const dedicationName = params.dedicationName?.trim();
  if (dedicationName) {
    search.set('dedication', dedicationName);
    if (params.dedicationType) {
      search.set('dedicationType', params.dedicationType);
    }
  }

  const payload = canonicalReceiptPayload({
    name: params.name,
    amount: amountStr,
    date: dateStr,
    method,
    campaign: campaign && !isPaymentMethodCampaign(campaign) ? campaign : undefined,
    dedication: dedicationName,
    dedicationType: params.dedicationType ?? undefined,
    memo,
  });

  const sig = signReceiptPayload(payload);
  if (sig) {
    search.set(RECEIPT_SIG_PARAM, sig);
  }

  return `/receipt?${search.toString()}`;
}

export function verifyReceiptSearchParams(
  params: Record<string, string | string[] | undefined>
): boolean {
  const secret = getReceiptSigningSecret();
  if (!secret) return false;

  const sig = readReceiptParam(params[RECEIPT_SIG_PARAM]);
  if (!sig) return false;

  const name = readReceiptParam(params.name);
  const amount = readReceiptParam(params.amount);
  const date = readReceiptParam(params.date);
  const method = readReceiptParam(params.method) ?? 'Credit Card';

  if (!name || !amount || !date) return false;

  const payload = canonicalReceiptPayload({
    name,
    amount,
    date,
    method,
    campaign: readReceiptParam(params.campaign),
    dedication: readReceiptParam(params.dedication),
    dedicationType: readReceiptParam(params.dedicationType),
    memo: readReceiptParam(params.memo),
  });

  const expected = signReceiptPayload(payload);
  if (!expected) return false;

  return safeEqual(sig, expected);
}
