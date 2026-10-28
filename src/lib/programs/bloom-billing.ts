import {
  getBloomGrandTotal,
  getBloomInstallmentAmounts,
  type BloomPaymentMethod,
  type BloomPaymentPlan,
} from '@/lib/programs/bloom-tuition';

export function parseBloomPaymentMethodFromNotes(notes: string | null): BloomPaymentMethod {
  if (!notes) return 'bank';
  if (notes.toLowerCase().includes('credit card')) return 'card';
  return 'bank';
}

export function resolveBloomPaymentMethod(
  preference: string | null | undefined,
  notes: string | null
): BloomPaymentMethod {
  if (preference === 'card' || preference === 'bank') return preference;
  return parseBloomPaymentMethodFromNotes(notes);
}

/** School-year installment due dates (acceptance = charged immediately). */
export function getBloomInstallmentDueDates(
  paymentPlan: BloomPaymentPlan,
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

export function getBloomFamilyTuitionBilling(input: {
  tuitionSubtotal: number;
  paymentPlan: BloomPaymentPlan;
  paymentMethod: BloomPaymentMethod;
  term: string | null;
}) {
  const amounts = getBloomInstallmentAmounts(
    input.tuitionSubtotal,
    input.paymentMethod,
    input.paymentPlan
  );
  const dueDates = getBloomInstallmentDueDates(input.paymentPlan, input.term);
  const grandTotal = getBloomGrandTotal(input.tuitionSubtotal, input.paymentMethod);

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
