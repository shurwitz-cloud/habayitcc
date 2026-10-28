export type ReceiptDensity = 'compact' | 'dense';

/**
 * Annual receipt spacing — approved Jul 2026.
 * 1–26 gifts: compact (readable table + footer buffer).
 * 27+ gifts: dense; disclaimer may continue on page 2.
 */
export function getAnnualReceiptDensity(lineCount: number): ReceiptDensity {
  if (lineCount <= 26) return 'compact';
  return 'dense';
}

export const ANNUAL_RECEIPT_DENSITY_HINTS: Record<ReceiptDensity, string> = {
  compact: '1–26 gifts — approved spacing.',
  dense: '27+ gifts — slightly tighter; long lists may use a second page.',
};
