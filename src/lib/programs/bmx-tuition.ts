export const BMX_MONTHLY_TUITION = 65;

/** September through May */
export const BMX_SESSION_MONTHS = 9;

export const BMX_SESSION_TUITION = BMX_MONTHLY_TUITION * BMX_SESSION_MONTHS;

/** One month off for HaBayit Chai Partners. */
export const BMX_CHAI_DISCOUNT = BMX_MONTHLY_TUITION;

export const BMX_CHAI_SESSION_TUITION = BMX_SESSION_TUITION - BMX_CHAI_DISCOUNT;

/** Discount when paying the full year in one payment. */
export const BMX_PAY_IN_FULL_DISCOUNT = 15;

/** Early registration discount. */
export const BMX_EARLY_BIRD_DISCOUNT = 40;

/** Inclusive last day for early-bird pricing (America/New_York calendar date). */
export const BMX_EARLY_BIRD_LAST_DAY = '2026-08-18';

/** Display label for early-bird deadline copy. */
export const BMX_EARLY_BIRD_DEADLINE_LABEL = 'August 18';

export type BmxPaymentPlan = 'full' | 'two_installments';

export type BmxPaymentMethod = 'card' | 'bank';

/** Card processing fee passed to the payer (3%). Bank (ACH) has no surcharge. */
export const BMX_CARD_PROCESSING_RATE = 0.03;

export function isBmxEarlyBirdActive(now: Date = new Date()): boolean {
  const etDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return etDate <= BMX_EARLY_BIRD_LAST_DAY;
}

export function getBmxSessionTuition(
  isChaiPartner: boolean,
  paymentPlan: BmxPaymentPlan = 'two_installments',
  options?: { now?: Date; earlyBird?: boolean }
): number {
  let total = isChaiPartner ? BMX_CHAI_SESSION_TUITION : BMX_SESSION_TUITION;
  const earlyBird = options?.earlyBird ?? isBmxEarlyBirdActive(options?.now);
  if (earlyBird) total -= BMX_EARLY_BIRD_DISCOUNT;
  if (paymentPlan === 'full') total -= BMX_PAY_IN_FULL_DISCOUNT;
  return total;
}

export function getBmxCardProcessingFee(
  tuitionSubtotal: number,
  paymentMethod: BmxPaymentMethod
): number {
  if (paymentMethod !== 'card') return 0;
  return Math.round(tuitionSubtotal * BMX_CARD_PROCESSING_RATE * 100) / 100;
}

export function getBmxGrandTotal(
  tuitionSubtotal: number,
  paymentMethod: BmxPaymentMethod
): number {
  return tuitionSubtotal + getBmxCardProcessingFee(tuitionSubtotal, paymentMethod);
}

/** Split tuition into equal installment amounts (last payment absorbs rounding). */
export function getBmxInstallmentAmounts(
  tuitionSubtotal: number,
  paymentMethod: BmxPaymentMethod,
  paymentPlan: BmxPaymentPlan
): number[] {
  const grandTotal = getBmxGrandTotal(tuitionSubtotal, paymentMethod);
  const count = paymentPlan === 'full' ? 1 : 2;
  const base = Math.floor((grandTotal / count) * 100) / 100;
  const amounts = Array.from({ length: count }, () => base);
  const remainder = Math.round((grandTotal - base * count) * 100) / 100;
  amounts[amounts.length - 1] = Math.round((amounts[amounts.length - 1] + remainder) * 100) / 100;
  return amounts;
}
