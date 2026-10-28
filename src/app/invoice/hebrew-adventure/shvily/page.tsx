import type { Metadata } from 'next';
import { InvoiceDocument } from '@/components/invoice/InvoiceDocument';
import { getShvilyInvoice, shvilyAmountDue } from '@/lib/invoice/shvily-invoice';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Invoice · Hebrew Adventure — HaBayit',
  robots: { index: false, follow: false },
};

/**
 * Printable Hebrew Adventure family invoice (2026–2027).
 * Personal details come from SHVILY_INVOICE_JSON (server env), never from the repo.
 */
export default function ShvilyHebrewAdventureInvoicePage() {
  const invoice = getShvilyInvoice();

  if (!invoice) {
    return (
      <main style={{ padding: '4rem 1rem', textAlign: 'center' }}>
        <h1>Invoice unavailable</h1>
        <p>This invoice is not available right now. Please contact office@habayitcc.org.</p>
      </main>
    );
  }

  const invoiceDate = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <main>
      <InvoiceDocument
        invoiceNumber={invoice.invoiceNumber}
        invoiceDate={invoiceDate}
        billToName={invoice.billToName}
        billToLines={invoice.billToLines}
        programTitle={invoice.programTitle}
        term={invoice.term}
        lines={invoice.lines}
        amountDue={shvilyAmountDue(invoice)}
        dueDate={invoice.dueDate}
        cardFeeNote={invoice.cardFeeNote}
      />
    </main>
  );
}
