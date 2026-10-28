/** Receipt display label — no "(Monthly)" suffix on printed receipts. */
export function formatReceiptMethod(method: string): string {
  return method.replace(/\s*\(monthly\)/gi, '').trim() || 'Credit Card';
}

export function receiptMethodFromDonationType(donationType: 'One-Time' | 'Monthly'): string {
  return 'Credit Card';
}

/** Manual Check gifts: "Check" or "Check #123" on the receipt Payment Type. */
export function formatCheckPaymentMethod(checkNumber?: string | null): string {
  const raw = (checkNumber || '').trim().replace(/^#+/, '');
  if (!raw) return 'Check';
  return `Check #${raw}`;
}
