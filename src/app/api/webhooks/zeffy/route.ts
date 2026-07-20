import { NextRequest, NextResponse } from 'next/server';
import {
  isLikelyChaiPartnerPayment,
  parseZeffyWebhook,
} from '@/lib/zeffy/parse-webhook';
import { recordZeffyChaiPartnerPayment } from '@/lib/zeffy/record-chai-payment';
import type { ZeffyPaymentLike } from '@/lib/zeffy/types';

export const dynamic = 'force-dynamic';

/**
 * Zeffy → HaBayit webhook.
 * Configure in Zeffy: Settings → Integrations → Webhook
 * URL: https://habayitcc.org/api/webhooks/zeffy
 *
 * When a payment completes, we upsert a Chai Partner (if campaign/amount matches)
 * and record the payment in CRM.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  console.info('[zeffy webhook] incoming', summarize(body));

  const parsed = parseZeffyWebhook(body);
  if (!parsed) {
    console.warn('[zeffy webhook] Unrecognized or non-completed payload', summarize(body));
    // Still 200 so Zeffy does not endlessly retry malformed noise we cannot use.
    return NextResponse.json({ received: true, handled: false, reason: 'unrecognized_payload' });
  }

  // Soft verify only — never block recording if API lookup fails or status is odd.
  const verified = await verifyPaymentWithApi(parsed.paymentId);
  if (verified === false) {
    console.warn(
      '[zeffy webhook] API did not confirm payment; recording from webhook payload anyway',
      parsed.paymentId
    );
  }

  if (!isLikelyChaiPartnerPayment(parsed)) {
    console.info(
      '[zeffy webhook] Skipping non-Chai payment',
      parsed.paymentId,
      parsed.amountDollars,
      parsed.campaignTitle,
      parsed.campaignId,
      parsed.email
    );
    return NextResponse.json({ received: true, handled: false, reason: 'not_chai_partner' });
  }

  try {
    const result = await recordZeffyChaiPartnerPayment(parsed);
    if (!result.ok) {
      console.error('[zeffy webhook] Failed to record', parsed.paymentId);
      return NextResponse.json({ error: 'Failed to record payment.' }, { status: 500 });
    }
    console.info('[zeffy webhook] recorded', {
      paymentId: parsed.paymentId,
      email: parsed.email,
      amount: parsed.amountDollars,
      partnerId: result.partnerId,
      duplicate: result.duplicate,
    });
    return NextResponse.json({
      received: true,
      handled: true,
      duplicate: Boolean(result.duplicate),
      partnerId: result.partnerId,
    });
  } catch (err) {
    console.error('[zeffy webhook] Error:', err);
    return NextResponse.json({ error: 'Internal error.' }, { status: 500 });
  }
}

/** GET is handy for a quick uptime check from the browser. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/webhooks/zeffy',
    hint: 'POST payment.completed payloads from Zeffy Integrations.',
  });
}

/**
 * Returns:
 * - true if verified or no API key configured (skip verify)
 * - false if API key is set and payment cannot be confirmed
 */
async function verifyPaymentWithApi(paymentId: string): Promise<boolean | 'skipped'> {
  const apiKey = process.env.ZEFFY_API_KEY?.trim();
  if (!apiKey) return 'skipped';

  try {
    const res = await fetch(`https://api.zeffy.com/api/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (res.status === 404) return false;
    if (!res.ok) {
      console.warn('[zeffy webhook] API lookup non-OK', res.status, paymentId);
      // Don't block recording if API is flaky — webhook payload is source of truth.
      return 'skipped';
    }

    const payment = (await res.json()) as ZeffyPaymentLike;
    const status = String(payment.status ?? '').toLowerCase();
    if (status && !['succeeded', 'completed', 'paid', 'success'].includes(status)) {
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[zeffy webhook] API verify error:', err);
    return 'skipped';
  }
}

function summarize(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const o = body as Record<string, unknown>;
  const data = o.data && typeof o.data === 'object' ? (o.data as Record<string, unknown>) : null;
  const obj =
    data?.object && typeof data.object === 'object'
      ? (data.object as Record<string, unknown>)
      : o.payment && typeof o.payment === 'object'
        ? (o.payment as Record<string, unknown>)
        : null;
  return {
    type: o.type ?? o.event,
    keys: Object.keys(o).slice(0, 20),
    dataKeys: data ? Object.keys(data).slice(0, 12) : undefined,
    paymentKeys: obj ? Object.keys(obj).slice(0, 20) : undefined,
    hasAmount: obj ? obj.amount != null || obj.amount_total != null || obj.total != null : undefined,
    hasContact: obj
      ? Boolean(obj.contact || obj.buyer || obj.donor || obj.email)
      : undefined,
  };
}
