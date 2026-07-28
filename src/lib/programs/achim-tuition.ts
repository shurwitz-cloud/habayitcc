export const ACHIM_MONTHLY_TUITION = 65;

/** September through May */
export const ACHIM_SESSION_MONTHS = 9;

export const ACHIM_SESSION_TUITION = ACHIM_MONTHLY_TUITION * ACHIM_SESSION_MONTHS;

export const ACHIM_CHAI_DISCOUNT = 65;

export const ACHIM_CHAI_SESSION_TUITION = ACHIM_SESSION_TUITION - ACHIM_CHAI_DISCOUNT;

/** Discount when paying the full year in one payment. */
export const ACHIM_PAY_IN_FULL_DISCOUNT = 15;

export type AchimPaymentPlan = 'full' | 'two_installments';

export type AchimPaymentMethod = 'card' | 'bank';

/** Card processing fee passed to the payer (3%). Bank (ACH) has no surcharge. */
export const ACHIM_CARD_PROCESSING_RATE = 0.03;

export function getAchimSessionTuition(
  isChaiPartner: boolean,
  paymentPlan: AchimPaymentPlan = 'two_installments'
): number {
  const base = isChaiPartner ? ACHIM_CHAI_SESSION_TUITION : ACHIM_SESSION_TUITION;
  return paymentPlan === 'full' ? base - ACHIM_PAY_IN_FULL_DISCOUNT : base;
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
