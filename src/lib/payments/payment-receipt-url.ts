import 'server-only';

import { createHmac, timingSafeEqual } from 'crypto';
import { readReceiptParam } from '@/lib/donations/receipt-url';

export interface PaymentReceiptItem {
  label: string;
  qty: number;
  unit: number;
}

export interface PaymentReceiptUrlParams {
  name: string;
  date?: Date;
  method?: string;
  items: PaymentReceiptItem[];
  /** Optional reference; only for methods that carry one (e.g. check number). Zelle/Cash omit it. */
  ref?: string;
  /** Allocation note, e.g. "$X of this payment applied to this receipt." */
  note?: string;
}

const SIG_PARAM = 'sig';
const ITEM_PARAM = 'item';

/** Same server-side secrets as the donation receipt links. */
function receiptSigningSecrets(): string[] {
  const receiptSecret = process.env.RECEIPT_SIGNING_SECRET?.trim();
  const adminSecret = process.env.ADMIN_SECRET?.trim();
  const secrets: string[] = [];
  if (receiptSecret) secrets.push(receiptSecret);
  if (adminSecret && adminSecret !== receiptSecret) secrets.push(adminSecret);
  return secrets;
}

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function formatPaymentReceiptDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

export function encodePaymentReceiptItem(item: PaymentReceiptItem): string {
  return `${item.label}|${item.qty}|${item.unit.toFixed(2)}`;
}

export function parsePaymentReceiptItem(raw: string): PaymentReceiptItem | null {
  const parts = raw.split('|');
  if (parts.length !== 3) return null;
  const label = parts[0].trim();
  const qty = Number(parts[1]);
  const unit = Number(parts[2]);
  if (!label || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unit) || unit < 0) {
    return null;
  }
  return { label, qty, unit };
}

function canonicalPayload(params: {
  name: string;
  date: string;
  method: string;
  items: string[];
  ref?: string;
  note?: string;
}): string {
  const items = [...params.items].sort();
  return [
    `type=payment-receipt`,
    `date=${params.date}`,
    `items=${items.join(',')}`,
    `method=${params.method}`,
    `name=${params.name}`,
    `note=${params.note ?? ''}`,
    `ref=${params.ref ?? ''}`,
  ].join('\n');
}

export function buildPaymentReceiptUrl(params: PaymentReceiptUrlParams): string {
  const date = params.date ?? new Date();
  const dateStr = formatPaymentReceiptDate(date);
  const method = params.method?.trim() || 'Zelle';
  const items = params.items.map(encodePaymentReceiptItem);
  const ref = params.ref?.trim();
  const note = params.note?.trim();

  const search = new URLSearchParams({
    name: params.name,
    date: dateStr,
    method,
  });
  for (const item of items) search.append(ITEM_PARAM, item);
  if (ref) search.set('ref', ref);
  if (note) search.set('note', note);

  const payload = canonicalPayload({ name: params.name, date: dateStr, method, items, ref, note });
  const secret = receiptSigningSecrets()[0];
  if (secret) search.set(SIG_PARAM, signPayload(payload, secret));

  return `/payment-receipt?${search.toString()}`;
}

export function verifyPaymentReceiptSearchParams(
  params: Record<string, string | string[] | undefined>
): boolean {
  const secrets = receiptSigningSecrets();
  if (secrets.length === 0) return false;

  const sig = readReceiptParam(params[SIG_PARAM]);
  if (!sig) return false;

  const name = readReceiptParam(params.name);
  const date = readReceiptParam(params.date);
  const method = readReceiptParam(params.method) ?? 'Zelle';
  const rawItems = params[ITEM_PARAM];
  const items = (Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [])
    .map((value) => readReceiptParam(value))
    .filter((value): value is string => Boolean(value));

  if (!name || !date || items.length === 0) return false;

  const payload = canonicalPayload({
    name,
    date,
    method,
    items,
    ref: readReceiptParam(params.ref),
    note: readReceiptParam(params.note),
  });

  return secrets.some((secret) => safeEqual(sig, signPayload(payload, secret)));
}
