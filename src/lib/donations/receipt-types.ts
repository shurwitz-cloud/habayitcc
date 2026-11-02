export interface ReceiptLine {
  date: string;
  memo: string;
  method: string;
  /** For quid-pro-quo lines this is the DEDUCTIBLE portion (amount paid minus goods value). */
  amount: number;
  /**
   * Quid pro quo (IRS): set when the payer received goods/services in
   * exchange. The receipt discloses these instead of claiming no goods
   * were provided, and totals use the deductible portion above.
   */
  goodsDescription?: string;
  goodsFmv?: number;
}

export interface ReceiptDocumentProps {
  name: string;
  lines: ReceiptLine[];
  /** Shown at top — defaults to today for single receipts, year-end for annual. */
  letterDate?: string;
  variant?: 'single' | 'annual';
  taxYear?: number;
}

export function formatReceiptAmount(amount: number): string {
  if (Number.isNaN(amount)) return '________';
  if (amount < 0) return '$0.00';
  return `$${amount.toFixed(2)}`;
}

export function sumReceiptLines(lines: ReceiptLine[]): number {
  return lines.reduce((sum, line) => sum + line.amount, 0);
}
