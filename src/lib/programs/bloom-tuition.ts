// Bloom tuition mirrors HaBayit Achim. All figures are centralized here so
// pricing changes are a one-file edit.
export const BLOOM_MONTHLY_TUITION = 75;

/** September through May */
export const BLOOM_SESSION_MONTHS = 9;

export const BLOOM_SESSION_TUITION = BLOOM_MONTHLY_TUITION * BLOOM_SESSION_MONTHS;

/** One month off for HaBayit Chai Partners. */
export const BLOOM_CHAI_DISCOUNT = BLOOM_MONTHLY_TUITION;

export const BLOOM_CHAI_SESSION_TUITION = BLOOM_SESSION_TUITION - BLOOM_CHAI_DISCOUNT;

/** Discount when paying the full year in one payment. */
export const BLOOM_PAY_IN_FULL_DISCOUNT = 15;

/** Signup by early registration deadline — early registration discount. */
export const BLOOM_EARLY_BIRD_DISCOUNT = 50;

/** Inclusive last day for early-bird pricing (America/New_York calendar date). */
export const BLOOM_EARLY_BIRD_LAST_DAY = '2026-08-12';

/** Display label for early-bird deadline copy. */
export const BLOOM_EARLY_BIRD_DEADLINE_LABEL = 'August 12';

export type BloomPaymentPlan = 'full' | 'two_installments';

export type BloomPaymentMethod = 'card' | 'bank';

/** Card processing fee passed to the payer (3%). Bank (ACH) has no surcharge. */
export const BLOOM_CARD_PROCESSING_RATE = 0.03;

export function isBloomEarlyBirdActive(now: Date = new Date()): boolean {
  const etDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return etDate <= BLOOM_EARLY_BIRD_LAST_DAY;
}

export function getBloomSessionTuition(
  isChaiPartner: boolean,
  paymentPlan: BloomPaymentPlan = 'two_installments',
  options?: { now?: Date; earlyBird?: boolean }
): number {
  let total = isChaiPartner ? BLOOM_CHAI_SESSION_TUITION : BLOOM_SESSION_TUITION;
  const earlyBird = options?.earlyBird ?? isBloomEarlyBirdActive(options?.now);
  if (earlyBird) total -= BLOOM_EARLY_BIRD_DISCOUNT;
  if (paymentPlan === 'full') total -= BLOOM_PAY_IN_FULL_DISCOUNT;
  return total;
}

export function getBloomCardProcessingFee(
  tuitionSubtotal: number,
  paymentMethod: BloomPaymentMethod
): number {
  if (paymentMethod !== 'card') return 0;
  return Math.round(tuitionSubtotal * BLOOM_CARD_PROCESSING_RATE * 100) / 100;
}

export function getBloomGrandTotal(
  tuitionSubtotal: number,
  paymentMethod: BloomPaymentMethod
): number {
  return tuitionSubtotal + getBloomCardProcessingFee(tuitionSubtotal, paymentMethod);
}

/** Split tuition into equal installment amounts (last payment absorbs rounding). */
export function getBloomInstallmentAmounts(
  tuitionSubtotal: number,
  paymentMethod: BloomPaymentMethod,
  paymentPlan: BloomPaymentPlan
): number[] {
  const grandTotal = getBloomGrandTotal(tuitionSubtotal, paymentMethod);
  const count = paymentPlan === 'full' ? 1 : 2;
  const base = Math.floor((grandTotal / count) * 100) / 100;
  const amounts = Array.from({ length: count }, () => base);
  const remainder = Math.round((grandTotal - base * count) * 100) / 100;
  amounts[amounts.length - 1] = Math.round((amounts[amounts.length - 1] + remainder) * 100) / 100;
  return amounts;
}
