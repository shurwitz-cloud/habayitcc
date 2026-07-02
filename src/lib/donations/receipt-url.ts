import type { DedicationType } from '@/types/database';
import { DEFAULT_DONATION_MEMO, formatReceiptMemo, resolveDonationMemo } from './memo';

export interface ReceiptUrlParams {
  name: string;
  amount: number;
  date?: Date;
  campaign?: string | null;
  dedicationName?: string | null;
  dedicationType?: DedicationType | null;
  method?: string;
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
}): string {
  const campaign = params.campaign?.trim();
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

  return params.memo?.trim() || DEFAULT_DONATION_MEMO;
}

export function buildReceiptUrl(params: ReceiptUrlParams): string {
  const date = params.date ?? new Date();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();

  const search = new URLSearchParams({
    name: params.name,
    amount: params.amount.toFixed(2),
    date: `${mm}/${dd}/${yyyy}`,
    method: params.method ?? 'Credit Card',
  });

  const campaign = params.campaign?.trim();
  if (campaign) search.set('campaign', campaign);

  const dedicationName = params.dedicationName?.trim();
  if (dedicationName) {
    search.set('dedication', dedicationName);
    if (params.dedicationType) {
      search.set('dedicationType', params.dedicationType);
    }
  }

  return `/receipt?${search.toString()}`;
}
