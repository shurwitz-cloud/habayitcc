export interface ReceiptLine {
  date: string;
  memo: string;
  method: string;
  amount: number;
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
  if (Number.isNaN(amount) || amount < 0) return '$0.00';
  return `$${amount.toFixed(2)}`;
}

export function sumReceiptLines(lines: ReceiptLine[]): number {
  return lines.reduce((sum, line) => sum + line.amount, 0);
}
