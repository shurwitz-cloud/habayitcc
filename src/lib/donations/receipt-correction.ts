import 'server-only';

import { createAdminClient } from '@/lib/supabase/server';
import { receiptMethodFromDonationType } from './receipt-method';

/**
 * Admin-recorded receipt corrections.
 *
 * A correction binds ONE already-sent signed receipt link (by its verified
 * HMAC signature) to ONE immutable donation/payment row. When that exact link
 * is opened, the receipt renders the payment's real ET date instead of the
 * date the link carried. Every other link renders exactly as minted.
 *
 * Fail closed everywhere: any lookup error, missing row, or inconsistency
 * between the link and the donation returns null and the link is unchanged.
 */

export interface ReceiptCorrectionMatch {
  donationId: string;
  paidAt: Date;
}

/**
 * Stored memo is memoParts.join(' · ') = [typed memo, "via <method>",
 * "Spouse: <names>"] (see the manual-entry / manual-donation routes).
 * Invert exactly: drop the generated parts, keep the typed remainder.
 */
export function bareDonationMemo(stored: string | null | undefined): string | undefined {
  return (
    (stored ?? '')
      .split(' · ')
      .filter(
        (part) => part.trim() && !part.startsWith('via ') && !part.startsWith('Spouse: '),
      )
      .join(' · ')
      .trim() || undefined
  );
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Pure consistency check: the link must describe this exact donation. */
export function correctionConsistent(input: {
  donationName: string;
  donationAmount: number;
  donationMethod: string;
  donationCampaign: string | null | undefined;
  linkName: string;
  linkAmount: number;
  linkMethod: string;
  linkCampaign: string | null | undefined;
}): boolean {
  if (Math.abs(input.donationAmount - input.linkAmount) > 0.005) return false;
  if (normalizeName(input.donationName) !== normalizeName(input.linkName)) return false;
  if (normalizeName(input.donationMethod) !== normalizeName(input.linkMethod)) return false;
  const donationCampaign = (input.donationCampaign ?? '').trim().toLowerCase();
  const linkCampaign = (input.linkCampaign ?? '').trim().toLowerCase();
  return donationCampaign === linkCampaign;
}

/** Method the original link would have carried for this donation. */
export function donationReceiptMethod(donation: {
  memo: string | null;
  donation_type: string | null;
}): string {
  return (
    donation.memo?.match(/via\s+([^·]+)/i)?.[1]?.trim() ??
    receiptMethodFromDonationType(donation.donation_type === 'Monthly' ? 'Monthly' : 'One-Time')
  );
}

/**
 * Resolve a verified signed link to its recorded correction, if any.
 * `sig` must already have passed verifyReceiptSearchParams.
 */
export async function resolveReceiptCorrection(input: {
  sig: string;
  name: string;
  amount: number;
  method: string;
  campaign: string | null | undefined;
}): Promise<ReceiptCorrectionMatch | null> {
  try {
    const supabase = createAdminClient();

    const { data: row, error } = await supabase
      .from('receipt_corrections')
      .select('donation_id')
      .eq('original_sig', input.sig)
      .maybeSingle();
    if (error || !row) return null;

    const { data: donation } = await supabase
      .from('donations')
      .select('id, first_name, last_name, amount, memo, campaign, donation_type, status')
      .eq('id', row.donation_id)
      .maybeSingle();
    if (!donation || donation.status !== 'succeeded') return null;

    const donationName = `${donation.first_name} ${donation.last_name}`.trim();
    if (
      !correctionConsistent({
        donationName,
        donationAmount: Number(donation.amount),
        donationMethod: donationReceiptMethod(donation),
        donationCampaign: donation.campaign,
        linkName: input.name,
        linkAmount: input.amount,
        linkMethod: input.method,
        linkCampaign: input.campaign,
      })
    ) {
      console.warn('[receipt] correction ignored: link/donation mismatch');
      return null;
    }

    const { data: payment } = await supabase
      .from('payments')
      .select('paid_at, status')
      .eq('source_type', 'donation')
      .eq('source_id', donation.id)
      .order('paid_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!payment?.paid_at || payment.status !== 'succeeded') return null;

    const paidAt = new Date(payment.paid_at);
    if (Number.isNaN(paidAt.getTime())) return null;

    return { donationId: donation.id, paidAt };
  } catch (err) {
    // Table missing on an undeployed migration, network error, etc: render the
    // link exactly as minted.
    console.warn('[receipt] correction lookup failed; rendering original link', err);
    return null;
  }
      }
