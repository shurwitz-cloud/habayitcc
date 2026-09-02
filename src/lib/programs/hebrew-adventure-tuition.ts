export const HEBREW_ADVENTURE_MONTHLY_TUITION = 125;

export const HEBREW_ADVENTURE_SESSION_MONTHS = 8;

export const HEBREW_ADVENTURE_SESSION_TUITION =
  HEBREW_ADVENTURE_MONTHLY_TUITION * HEBREW_ADVENTURE_SESSION_MONTHS;

export const HEBREW_ADVENTURE_CHAI_DISCOUNT = 100;

export const HEBREW_ADVENTURE_CHAI_SESSION_TUITION =
  HEBREW_ADVENTURE_SESSION_TUITION - HEBREW_ADVENTURE_CHAI_DISCOUNT;

/** Discount when paying the full year in one payment. */
export const HEBREW_ADVENTURE_PAY_IN_FULL_DISCOUNT = 25;

/** Limited-time early registration discount (through August 7, America/New_York). */
export const HEBREW_ADVENTURE_EARLY_BIRD_DISCOUNT = 50;

/** Inclusive end date (YYYY-MM-DD) in America/New_York. */
export const HEBREW_ADVENTURE_EARLY_BIRD_ENDS_ON = '2026-08-07';

export type HebrewAdventurePaymentPlan = 'full' | 'two_installments' | 'three_installments';

export type HebrewAdventurePaymentMethod = 'card' | 'bank';

/** Card processing fee passed to the payer (3%). Bank (ACH) has no surcharge. */
export const HEBREW_ADVENTURE_CARD_PROCESSING_RATE = 0.03;

export function isHebrewAdventureEarlyBirdActive(now = new Date()): boolean {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return today <= HEBREW_ADVENTURE_EARLY_BIRD_ENDS_ON;
}

export function getHebrewAdventureEarlyBirdDiscount(now = new Date()): number {
  return isHebrewAdventureEarlyBirdActive(now) ? HEBREW_ADVENTURE_EARLY_BIRD_DISCOUNT : 0;
}

export function getHebrewAdventurePaymentPlanDiscount(
  paymentPlan: HebrewAdventurePaymentPlan
): number {
  if (paymentPlan === 'full') return HEBREW_ADVENTURE_PAY_IN_FULL_DISCOUNT;
  return 0;
}

export function getHebrewAdventureBaseSessionTuition(isChaiPartner: boolean): number {
  return isChaiPartner
    ? HEBREW_ADVENTURE_CHAI_SESSION_TUITION
    : HEBREW_ADVENTURE_SESSION_TUITION;
}

export function getHebrewAdventureSessionTuition(
  isChaiPartner: boolean,
  paymentPlan: HebrewAdventurePaymentPlan = 'three_installments',
  now = new Date()
): number {
  return (
    getHebrewAdventureBaseSessionTuition(isChaiPartner) -
    getHebrewAdventureEarlyBirdDiscount(now) -
    getHebrewAdventurePaymentPlanDiscount(paymentPlan)
  );
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
