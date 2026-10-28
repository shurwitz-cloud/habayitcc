import {
  getBmxGrandTotal,
  getBmxInstallmentAmounts,
  type BmxPaymentMethod,
  type BmxPaymentPlan,
} from '@/lib/programs/bmx-tuition';

export function parseBmxPaymentMethodFromNotes(notes: string | null): BmxPaymentMethod {
  if (!notes) return 'bank';
  if (notes.toLowerCase().includes('credit card')) return 'card';
  return 'bank';
}

export function resolveBmxPaymentMethod(
  preference: string | null | undefined,
  notes: string | null
): BmxPaymentMethod {
  if (preference === 'card' || preference === 'bank') return preference;
  return parseBmxPaymentMethodFromNotes(notes);
}

/** School-year installment due dates (acceptance = charged immediately). */
export function getBmxInstallmentDueDates(
  paymentPlan: BmxPaymentPlan,
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

export function getBmxFamilyTuitionBilling(input: {
  tuitionSubtotal: number;
  paymentPlan: BmxPaymentPlan;
  paymentMethod: BmxPaymentMethod;
  term: string | null;
}) {
  const amounts = getBmxInstallmentAmounts(
    input.tuitionSubtotal,
    input.paymentMethod,
    input.paymentPlan
  );
  const dueDates = getBmxInstallmentDueDates(input.paymentPlan, input.term);
  const grandTotal = getBmxGrandTotal(input.tuitionSubtotal, input.paymentMethod);

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
