/** Infer CRM payment method label from a manual ledger key. */
export function inferPaymentMethodFromIntentId(
  intentId?: string | null,
): string | null {
  if (!intentId) return null;
  const raw = intentId.replace(/^zeffy:/i, '').toLowerCase();
  if (!raw.startsWith('manual-')) {
    if (intentId.startsWith('pi_') || intentId.startsWith('ch_')) return 'Credit Card';
    if (raw.startsWith('zeffy')) return 'Zeffy';
    return null;
  }

  const rest = raw.slice('manual-'.length);
  // Keys look like: chai_partner-cash-email-15000  OR  donation-zelle-…
  const known = [
    'habayit-donation-link',
    'cash-app',
    'credit-card',
    'zelle',
    'zeffy',
    'cash',
    'check',
    'other',
  ] as const;
  for (const slug of known) {
    // …-cash-… or starts with cash- after kind prefix
    if (rest.includes(`-${slug}-`) || rest.startsWith(`${slug}-`)) {
      return slugToMethodLabel(slug);
    }
    // kind-method-email: chai_partner-cash-…
    const m = rest.match(new RegExp(`(?:^|[a-z0-9_]+-)${slug}-`));
    if (m) return slugToMethodLabel(slug);
  }
  return null;
}

function slugToMethodLabel(slug: string): string {
  switch (slug) {
    case 'habayit-donation-link':
      return 'HaBayit donation link';
    case 'cash-app':
      return 'Cash App';
    case 'credit-card':
      return 'Credit Card';
    case 'zelle':
      return 'Zelle';
    case 'zeffy':
      return 'Zeffy';
    case 'cash':
      return 'Cash';
    case 'check':
      return 'Check';
    default:
      return 'Other';
  }
}

/** Add calendar months to a date (day clamped). */
export function addCalendarMonths(iso: string, months: number): Date {
  const d = new Date(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

export function coverageMonthsOf(p: {
  coverage_months?: number | null;
}): number {
  const n = Number(p.coverage_months);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export function paymentCoversThrough(p: {
  paid_at?: string | null;
  created_at: string;
  coverage_months?: number | null;
}): Date {
  const start = p.paid_at || p.created_at;
  return addCalendarMonths(start, coverageMonthsOf(p));
}
