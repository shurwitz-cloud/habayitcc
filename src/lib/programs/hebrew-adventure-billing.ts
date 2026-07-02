import {
  getHebrewAdventureGrandTotal,
  getHebrewAdventureInstallmentAmounts,
  type HebrewAdventurePaymentMethod,
  type HebrewAdventurePaymentPlan,
} from '@/lib/programs/hebrew-adventure-tuition';

export function parsePaymentMethodFromNotes(notes: string | null): HebrewAdventurePaymentMethod {
  if (!notes) return 'bank';
  if (notes.toLowerCase().includes('credit card')) return 'card';
  return 'bank';
}

export function resolvePaymentMethod(
  preference: string | null | undefined,
  notes: string | null
): HebrewAdventurePaymentMethod {
  if (preference === 'card' || preference === 'bank') return preference;
  return parsePaymentMethodFromNotes(notes);
}

/** School-year installment due dates (acceptance = charged immediately). */
export function getHebrewAdventureInstallmentDueDates(
  paymentPlan: HebrewAdventurePaymentPlan,
  term: string | null
): Date[] {
  const match = term?.match(/^(\d{4})/);
  const startYear = match ? parseInt(match[1], 10) : new Date().getFullYear();

  if (paymentPlan === 'full') {
    return [new Date()];
  }
  if (paymentPlan === 'two_installments') {
    return [new Date(), new Date(startYear, 11, 1)];
  }
  return [new Date(), new Date(startYear, 10, 1), new Date(startYear, 11, 1)];
}

export function getFamilyTuitionBilling(input: {
  tuitionSubtotal: number;
  paymentPlan: HebrewAdventurePaymentPlan;
  paymentMethod: HebrewAdventurePaymentMethod;
  term: string | null;
}) {
  const amounts = getHebrewAdventureInstallmentAmounts(
    input.tuitionSubtotal,
    input.paymentMethod,
    input.paymentPlan
  );
  const dueDates = getHebrewAdventureInstallmentDueDates(input.paymentPlan, input.term);
  const grandTotal = getHebrewAdventureGrandTotal(input.tuitionSubtotal, input.paymentMethod);

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
