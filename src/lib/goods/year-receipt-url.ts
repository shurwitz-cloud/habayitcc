import 'server-only';

import { createHmac, timingSafeEqual } from 'crypto';
import { readReceiptParam } from '@/lib/donations/receipt-url';

/**
 * Signed links for the year-end goods/services receipt page.
 * The link carries only email + year; the page queries the actual
 * rows after verifying the signature, so receipts always render
 * current data and cannot be forged without a server secret.
 */

const SIG_PARAM = 'sig';

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

function canonicalPayload(email: string, year: number): string {
  return [`type=goods-year-receipt`, `email=${email}`, `year=${year}`].join('\n');
}

export function buildGoodsYearReceiptUrl(params: { email: string; year: number }): string {
  const email = params.email.trim().toLowerCase();
  const search = new URLSearchParams({
    email,
    year: String(params.year),
  });
  const secret = receiptSigningSecrets()[0];
  if (secret) search.set(SIG_PARAM, signPayload(canonicalPayload(email, params.year), secret));
  return `/goods-year-receipt?${search.toString()}`;
}

export function verifyGoodsYearReceiptSearchParams(
  params: Record<string, string | string[] | undefined>,
): { email: string; year: number } | null {
  const secrets = receiptSigningSecrets();
  if (secrets.length === 0) return null;

  const sig = readReceiptParam(params[SIG_PARAM]);
  const email = readReceiptParam(params.email)?.trim().toLowerCase();
  const year = Number(readReceiptParam(params.year));
  if (!sig || !email || !Number.isInteger(year) || year < 2000 || year > 2100) return null;

  const payload = canonicalPayload(email, year);
  const ok = secrets.some((secret) => safeEqual(sig, signPayload(payload, secret)));
  return ok ? { email, year } : null;
}
