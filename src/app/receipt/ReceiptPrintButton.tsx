'use client';

export function ReceiptPrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="receipt-print-btn"
    >
      Print / Save as PDF
    </button>
  );
}
