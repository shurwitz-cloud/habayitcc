/** Receipt display label — no "(Monthly)" suffix on printed receipts. */
export function formatReceiptMethod(method: string): string {
  return method.replace(/\s*\(monthly\)/gi, '').trim() || 'Credit Card';
}

export function receiptMethodFromDonationType(donationType: 'One-Time' | 'Monthly'): string {
  return 'Credit Card';
}
