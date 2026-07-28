import {
  getAchimGrandTotal,
  getAchimInstallmentAmounts,
  type AchimPaymentMethod,
  type AchimPaymentPlan,
} from '@/lib/programs/achim-tuition';

export function parseAchimPaymentMethodFromNotes(notes: string | null): AchimPaymentMethod {
  if (!notes) return 'bank';
  if (notes.toLowerCase().includes('credit card')) return 'card';
  return 'bank';
}

export function resolveAchimPaymentMethod(
  preference: string | null | undefined,
  notes: string | null
): AchimPaymentMethod {
  if (preference === 'card' || preference === 'bank') return preference;
  return parseAchimPaymentMethodFromNotes(notes);
}

/** School-year installment due dates (acceptance = charged immediately). */
export function getAchimInstallmentDueDates(
  paymentPlan: AchimPaymentPlan,
  term: string | null
): Date[] {
  const match = term?.match(/^(\d{4})/);
  const startYear = match ? parseInt(match[1], 10) : new Date().getFullYear();

  if (paymentPlan === 'full') {
    return [new Date()];
  }
  // Two payments: upon acceptance and by November 1
  return [new Date(), new Date(startYear, 10, 1)];
}

export function getAchimFamilyTuitionBilling(input: {
  tuitionSubtotal: number;
  paymentPlan: AchimPaymentPlan;
  paymentMethod: AchimPaymentMethod;
  term: string | null;
}) {
  const amounts = getAchimInstallmentAmounts(
    input.tuitionSubtotal,
    input.paymentMethod,
    input.paymentPlan
  );
  const dueDates = getAchimInstallmentDueDates(input.paymentPlan, input.term);
  const grandTotal = getAchimGrandTotal(input.tuitionSubtotal, input.paymentMethod);

  return {
    grandTotal,
    installments: amounts.map((amount, index) => ({
      number: index + 1,
      amount,
      dueDate: dueDates[index] ?? dueDates[dueDates.length - 1],
      chargeOnAccept: index === 0,
    })),
  };
}

export function formatUsd(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function stripeCustomerUrl(customerId: string): string {
  return `https://dashboard.stripe.com/customers/${customerId}`;
}
