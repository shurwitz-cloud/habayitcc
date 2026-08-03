export const ACHIM_MONTHLY_TUITION = 75;

/** September through May */
export const ACHIM_SESSION_MONTHS = 9;

export const ACHIM_SESSION_TUITION = ACHIM_MONTHLY_TUITION * ACHIM_SESSION_MONTHS;

/** One month off for HaBayit Chai Partners. */
export const ACHIM_CHAI_DISCOUNT = ACHIM_MONTHLY_TUITION;

export const ACHIM_CHAI_SESSION_TUITION = ACHIM_SESSION_TUITION - ACHIM_CHAI_DISCOUNT;

/** Discount when paying the full year in one payment. */
export const ACHIM_PAY_IN_FULL_DISCOUNT = 15;

/** Signup by end of July (Eastern) — early registration discount. */
export const ACHIM_EARLY_BIRD_DISCOUNT = 50;

/** Inclusive last day for early-bird pricing (America/New_York calendar date). */
export const ACHIM_EARLY_BIRD_LAST_DAY = '2026-08-05';

/** Display label for early-bird deadline copy. */
export const ACHIM_EARLY_BIRD_DEADLINE_LABEL = 'August 5';

export type AchimPaymentPlan = 'full' | 'two_installments';

export type AchimPaymentMethod = 'card' | 'bank';

/** Card processing fee passed to the payer (3%). Bank (ACH) has no surcharge. */
export const ACHIM_CARD_PROCESSING_RATE = 0.03;

export function isAchimEarlyBirdActive(now: Date = new Date()): boolean {
  const etDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return etDate <= ACHIM_EARLY_BIRD_LAST_DAY;
}

export function getAchimSessionTuition(
  isChaiPartner: boolean,
  paymentPlan: AchimPaymentPlan = 'two_installments',
  options?: { now?: Date; earlyBird?: boolean }
): number {
  let total = isChaiPartner ? ACHIM_CHAI_SESSION_TUITION : ACHIM_SESSION_TUITION;
  const earlyBird = options?.earlyBird ?? isAchimEarlyBirdActive(options?.now);
  if (earlyBird) total -= ACHIM_EARLY_BIRD_DISCOUNT;
  if (paymentPlan === 'full') total -= ACHIM_PAY_IN_FULL_DISCOUNT;
  return total;
}

export function getAchimCardProcessingFee(
  tuitionSubtotal: number,
  paymentMethod: AchimPaymentMethod
): number {
  if (paymentMethod !== 'card') return 0;
  return Math.round(tuitionSubtotal * ACHIM_CARD_PROCESSING_RATE * 100) / 100;
}

export function getAchimGrandTotal(
  tuitionSubtotal: number,
  paymentMethod: AchimPaymentMethod
): number {
  return tuitionSubtotal + getAchimCardProcessingFee(tuitionSubtotal, paymentMethod);
}

/** Split tuition into equal installment amounts (last payment absorbs rounding). */
export function getAchimInstallmentAmounts(
  tuitionSubtotal: number,
  paymentMethod: AchimPaymentMethod,
  paymentPlan: AchimPaymentPlan
): number[] {
  const grandTotal = getAchimGrandTotal(tuitionSubtotal, paymentMethod);
  const count = paymentPlan === 'full' ? 1 : 2;
  const base = Math.floor((grandTotal / count) * 100) / 100;
  const amounts = Array.from({ length: count }, () => base);
  const remainder = Math.round((grandTotal - base * count) * 100) / 100;
  amounts[amounts.length - 1] = Math.round((amounts[amounts.length - 1] + remainder) * 100) / 100;
  return amounts;
}
