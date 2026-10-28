/**
 * Shvily Hebrew Adventure invoice data.
 *
 * The family's personal details (names, address, email, phone, children,
 * amounts) live in the SHVILY_INVOICE_JSON environment variable (Vercel
 * Production + Preview), never in the repository. When the variable is
 * missing or invalid, every consumer degrades to an "unavailable" state
 * instead of rendering or sending personal data.
 */

export interface ShvilyInvoiceLine {
  description: string;
  detail: string;
  amount: number;
}

export interface ShvilyInvoice {
  invoiceNumber: string;
  billToName: string;
  billToLines: string[];
  programTitle: string;
  term: string;
  lines: ShvilyInvoiceLine[];
  dueDate: string;
  cardFeeNote: string;
  /** Default recipient for the invoice email. */
  emailTo: string;
  /** Email salutation used in the greeting line. */
  salutation: string;
  /** Children named in the email greeting sentence. */
  childNames: string;
}

export function getShvilyInvoice(): ShvilyInvoice | null {
  const raw = process.env.SHVILY_INVOICE_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ShvilyInvoice;
    if (!parsed.billToName || !Array.isArray(parsed.lines) || parsed.lines.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function shvilyAmountDue(invoice: ShvilyInvoice): number {
  return invoice.lines.reduce((sum, line) => sum + line.amount, 0);
}
