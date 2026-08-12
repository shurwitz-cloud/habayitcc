import type { DedicationType } from '@/types/database';
import { HEBREW_ADVENTURE_NAME } from '@/lib/programs/names';

export const DEFAULT_DONATION_MEMO = 'General Donation';

export const DONATION_CAMPAIGNS: Record<string, string> = {
  'lag-baomer': 'Lag BaOmer',
  purim: 'Purim',
  'chai-partner': 'Chai Partner',
  'hebrew-adventure': HEBREW_ADVENTURE_NAME,
  'hebrew-school': HEBREW_ADVENTURE_NAME, // legacy campaign links
  'bar-mitzvah': 'Bar Mitzvah',
  'bat-mitzvah': 'Bat Mitzvah',
};

/** Campaign values that are really just the payment method — not a gift memo. */
export function isPaymentMethodCampaign(campaign?: string | null): boolean {
  if (!campaign?.trim()) return false;
  const slug = campaign.trim().toLowerCase().replace(/[_\s]+/g, '-');
  return (
    slug === 'zelle' ||
    slug === 'zeffy' ||
    slug === 'cash' ||
    slug === 'check' ||
    slug === 'cashapp' ||
    slug === 'cash-app' ||
    slug === 'ach' ||
    slug === 'credit-card' ||
    slug === 'other'
  );
}

export function resolveDonationMemo(campaign?: string | null): string {
  if (!campaign?.trim() || isPaymentMethodCampaign(campaign)) {
    return DEFAULT_DONATION_MEMO;
  }

  const trimmed = campaign.trim();
  const slug = trimmed.toLowerCase();
  if (DONATION_CAMPAIGNS[slug]) return DONATION_CAMPAIGNS[slug];

  // Allow direct labels via ?campaign=Lag+BaOmer
  try {
    return decodeURIComponent(trimmed.replace(/\+/g, ' '));
  } catch {
    return trimmed;
  }
}

export function formatReceiptMemo(
  memo: string,
  dedication?: { name?: string | null; type?: DedicationType | null }
): string {
  // Event/campaign gifts: memo is the event name only
  if (memo !== DEFAULT_DONATION_MEMO) return memo;

  // General donation: show dedication if provided, otherwise default label
  const name = dedication?.name?.trim();
  if (!name) return DEFAULT_DONATION_MEMO;

  const prefix = dedication?.type === 'memory' ? 'In memory of' : 'In honor of';
  return `${prefix} ${name}`;
}
