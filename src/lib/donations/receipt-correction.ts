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
  content?: { name: string; memo: string; method: string };
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
  donationOriginalMethod?: string | null;
  donationCampaign: string | null | undefined;
  linkName: string;
  linkAmount: number;
  linkMethod: string;
  linkCampaign: string | null | undefined;
}): boolean {
  if (Math.abs(input.donationAmount - input.linkAmount) > 0.005) return false;
  if (normalizeName(input.donationName) !== normalizeName(input.linkName)) return false;
  const acceptedMethods = new Set(
    [input.donationMethod, input.donationOriginalMethod]
      .filter((m): m is string => !!m?.trim())
      .map(normalizeName),
  );
  if (!acceptedMethods.has(normalizeName(input.linkMethod))) return false;
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
      .select('donation_id, correct_content')
      .eq('original_sig', input.sig)
      .maybeSingle();
    if (error || !row) return null;

    const { data: donation } = await supabase
      .from('donations')
      .select('id, first_name, last_name, company, amount, memo, campaign, donation_type, status')
      .eq('id', row.donation_id)
      .maybeSingle();
    if (!donation || donation.status !== 'succeeded') return null;

    const { data: payment } = await supabase
      .from('payments')
      .select('paid_at, status, payment_method')
      .eq('source_type', 'donation')
      .eq('source_id', donation.id)
      .order('paid_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!payment?.paid_at || payment.status !== 'succeeded') return null;


    const donationName = `${donation.first_name} ${donation.last_name}`.trim();
    const originalMethod = donationReceiptMethod(donation);
    const recordMethod = payment.payment_method?.trim() || originalMethod;
    if (
      !correctionConsistent({
        donationName,
        donationAmount: Number(donation.amount),
        donationMethod: recordMethod,
        // An explicit content correction may repair the method itself, so the
        // link only needs to carry a method THIS donation could have minted.
        donationOriginalMethod: row.correct_content === true ? originalMethod : undefined,
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


    const paidAt = new Date(payment.paid_at);
    if (Number.isNaN(paidAt.getTime())) return null;

    return {
      donationId: donation.id, paidAt,
      ...(row.correct_content === true ? { content: {
        name: donation.company?.trim() || donationName,
        memo: bareDonationMemo(donation.memo) || '',
        method: recordMethod,
      } } : {}),
    };
  } catch (err) {
    // Table missing on an undeployed migration, network error, etc: render the
    // link exactly as minted.
    console.warn('[receipt] correction lookup failed; rendering original link', err);
    return null;
  }
}

/**
 * True when an admin explicitly superseded THIS exact signed link (by
 * signature). Fail-closed: lookup errors return false so a database hiccup
 * never blanks a valid receipt; only a recorded supersede does.
 */
export async function isReceiptSuperseded(sig: string): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('receipt_corrections')
      .select('superseded_at')
      .eq('original_sig', sig)
      .maybeSingle();
    if (error || !data) return false;
    return data.superseded_at != null;
  } catch {
    return false;
  }
}
