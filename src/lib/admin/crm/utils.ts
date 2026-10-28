import type { DateFilter } from './types';

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function dateFilterCutoff(filter: DateFilter): Date | null {
  if (filter === 'all') return null;
  const now = new Date();
  if (filter === '7d') return new Date(now.getTime() - 7 * 86400000);
  if (filter === '30d') return new Date(now.getTime() - 30 * 86400000);
  if (filter === '90d') return new Date(now.getTime() - 90 * 86400000);
  return new Date(now.getFullYear(), 0, 1);
}

export function matchesDateFilter(createdAt: string, filter: DateFilter): boolean {
  const cutoff = dateFilterCutoff(filter);
  if (!cutoff) return true;
  return new Date(createdAt) >= cutoff;
}

export function matchesSearch(
  query: string,
  fields: Array<string | null | undefined>,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => (f ?? '').toLowerCase().includes(q));
}

export function statusBadgeClass(status: string | null | undefined): string {
  const s = (status ?? '').toLowerCase();
  if (['succeeded', 'active', 'accepted', 'paid', 'resolved'].includes(s)) {
    return 'bg-[#e6f4ec] text-good';
  }
  if (['pending', 'processing', 'scheduled'].includes(s)) {
    return 'bg-[#fff8e6] text-gold';
  }
  if (['failed', 'cancelled', 'withdrawn', 'refunded'].includes(s)) {
    return 'bg-[#fdecea] text-danger';
  }
  if (['paused'].includes(s)) {
    return 'bg-soft text-muted';
  }
  return 'bg-soft text-navy';
}

export function stripeCustomerUrl(customerId: string): string {
  return `https://dashboard.stripe.com/customers/${customerId}`;
}

export function stripePaymentUrl(paymentIntentId: string): string {
  return `https://dashboard.stripe.com/payments/${paymentIntentId}`;
}

export function exportCsv(filename: string, headers: string[], rows: string[][]): void {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
