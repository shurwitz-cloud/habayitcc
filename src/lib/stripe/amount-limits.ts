/** Minimum online charge: $1.00 */
export const MIN_PUBLIC_AMOUNT_CENTS = 100;

/** Maximum online donation/subscription amount: $50,000.00 */
export const MAX_PUBLIC_DONATION_CENTS = 5_000_000;

export function validatePublicDonationAmountCents(
  amountCents: unknown
): { ok: true; amountCents: number } | { ok: false; error: string } {
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents)) {
    return { ok: false, error: 'Invalid amount.' };
  }

  if (amountCents < MIN_PUBLIC_AMOUNT_CENTS) {
    return { ok: false, error: 'Minimum donation is $1.' };
  }

  if (amountCents > MAX_PUBLIC_DONATION_CENTS) {
    return {
      ok: false,
      error:
        'Amount exceeds the online maximum. Please contact info@habayitcc.org for large gifts.',
    };
  }

  return { ok: true, amountCents };
}
