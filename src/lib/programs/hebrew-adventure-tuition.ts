export const HEBREW_ADVENTURE_MONTHLY_TUITION = 125;

export const HEBREW_ADVENTURE_SESSION_MONTHS = 8;

export const HEBREW_ADVENTURE_SESSION_TUITION =
  HEBREW_ADVENTURE_MONTHLY_TUITION * HEBREW_ADVENTURE_SESSION_MONTHS;

export const HEBREW_ADVENTURE_CHAI_DISCOUNT = 100;

export const HEBREW_ADVENTURE_CHAI_SESSION_TUITION =
  HEBREW_ADVENTURE_SESSION_TUITION - HEBREW_ADVENTURE_CHAI_DISCOUNT;

/** Discount when paying the full year in one payment. */
export const HEBREW_ADVENTURE_PAY_IN_FULL_DISCOUNT = 25;

/** Discount when choosing the two-payment plan. */
export const HEBREW_ADVENTURE_TWO_PAYMENT_DISCOUNT = 10;

export type HebrewAdventurePaymentPlan = 'full' | 'two_installments' | 'three_installments';

export type HebrewAdventurePaymentMethod = 'card' | 'bank';

/** Card processing fee passed to the payer (3%). Bank (ACH) has no surcharge. */
export const HEBREW_ADVENTURE_CARD_PROCESSING_RATE = 0.03;

export function getHebrewAdventurePaymentPlanDiscount(
  paymentPlan: HebrewAdventurePaymentPlan
): number {
  if (paymentPlan === 'full') return HEBREW_ADVENTURE_PAY_IN_FULL_DISCOUNT;
  if (paymentPlan === 'two_installments') return HEBREW_ADVENTURE_TWO_PAYMENT_DISCOUNT;
  return 0;
}

export function getHebrewAdventureSessionTuition(
  isChaiPartner: boolean,
  paymentPlan: HebrewAdventurePaymentPlan = 'three_installments'
): number {
  const base = isChaiPartner
    ? HEBREW_ADVENTURE_CHAI_SESSION_TUITION
    : HEBREW_ADVENTURE_SESSION_TUITION;
  return base - getHebrewAdventurePaymentPlanDiscount(paymentPlan);
}

export function getHebrewAdventureSiblingDiscount(childIndex: number): number {
  if (childIndex === 1) return 50;
  if (childIndex >= 2) return 75;
  return 0;
}

export function getHebrewAdventureCardProcessingFee(
  tuitionSubtotal: number,
  paymentMethod: HebrewAdventurePaymentMethod
): number {
  if (paymentMethod !== 'card') return 0;
  return Math.round(tuitionSubtotal * HEBREW_ADVENTURE_CARD_PROCESSING_RATE * 100) / 100;
}

export function getHebrewAdventureGrandTotal(
  tuitionSubtotal: number,
  paymentMethod: HebrewAdventurePaymentMethod
): number {
  return tuitionSubtotal + getHebrewAdventureCardProcessingFee(tuitionSubtotal, paymentMethod);
}

/** Split tuition into equal installment amounts (last payment absorbs rounding). */
export function getHebrewAdventureInstallmentAmounts(
  tuitionSubtotal: number,
  paymentMethod: HebrewAdventurePaymentMethod,
  paymentPlan: HebrewAdventurePaymentPlan
): number[] {
  const grandTotal = getHebrewAdventureGrandTotal(tuitionSubtotal, paymentMethod);
  const count =
    paymentPlan === 'full' ? 1 : paymentPlan === 'two_installments' ? 2 : 3;
  const base = Math.floor((grandTotal / count) * 100) / 100;
  const amounts = Array.from({ length: count }, () => base);
  const remainder = Math.round((grandTotal - base * count) * 100) / 100;
  amounts[amounts.length - 1] = Math.round((amounts[amounts.length - 1] + remainder) * 100) / 100;
  return amounts;
}
