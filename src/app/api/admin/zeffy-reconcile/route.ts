import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import {
  isLikelyChaiPartnerPayment,
  parseZeffyWebhook,
} from '@/lib/zeffy/parse-webhook';
import { recordZeffyChaiPartnerPayment } from '@/lib/zeffy/record-chai-payment';

export const dynamic = 'force-dynamic';

/**
 * Pull recent Zeffy payments via API and record any missing Chai Partners.
 * Admin-only. Never sends emails. Only imports gifts that match the Chai Partner form.
 *
 * POST /api/admin/zeffy-reconcile
 * Optional body: { limit?: number }
 */
export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;

  // Kill switch — re-enable only with NEXT_PUBLIC_ZEFFY_RECONCILE_ENABLED=true after campaign filter is verified.
  if (process.env.NEXT_PUBLIC_ZEFFY_RECONCILE_ENABLED !== 'true') {
    return NextResponse.json(
      {
        error:
          'Zeffy import is disabled after the false monthly-partner email incident. Set NEXT_PUBLIC_ZEFFY_RECONCILE_ENABLED=true only after campaign matching is verified.',
      },
      { status: 403 }
    );
  }

  const apiKey = process.env.ZEFFY_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'ZEFFY_API_KEY is not configured.' }, { status: 500 });
  }

  let limit = 25;
  try {
    const body = (await req.json()) as { limit?: number };
    if (typeof body.limit === 'number' && body.limit > 0 && body.limit <= 100) {
      limit = Math.floor(body.limit);
    }
  } catch {
    // empty body is fine
  }

  const res = await fetch(`https://api.zeffy.com/api/v1/payments?limit=${limit}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[zeffy reconcile] list payments failed', res.status, text.slice(0, 300));
    return NextResponse.json(
      { error: `Zeffy API error (${res.status}).` },
      { status: 502 }
    );
  }

  const json = (await res.json()) as {
    data?: unknown[];
    payments?: unknown[];
    results?: unknown[];
    has_more?: boolean;
  };

  const list = json.data ?? json.payments ?? json.results ?? (Array.isArray(json) ? json : []);
  if (!Array.isArray(list)) {
    return NextResponse.json({ error: 'Unexpected Zeffy payments response shape.' }, { status: 502 });
  }

  const results: Array<{
    paymentId?: string;
    email?: string;
    amount?: number;
    status: string;
    partnerId?: string;
    detail?: string;
  }> = [];

  for (const item of list) {
    const wrapped = { type: 'payment.completed', data: { object: item } };
    const parsed = parseZeffyWebhook(wrapped) ?? parseZeffyWebhook(item);
    if (!parsed) {
      results.push({ status: 'skipped_unparsed' });
      continue;
    }
    if (!isLikelyChaiPartnerPayment(parsed)) {
      results.push({
        paymentId: parsed.paymentId,
        email: parsed.email,
        amount: parsed.amountDollars,
        status: 'skipped_not_chai',
        detail: parsed.campaignTitle ?? parsed.campaignId ?? undefined,
      });
      continue;
    }

    try {
      // Never email on backfill — historical donors must not get "you're monthly" mail.
      const recorded = await recordZeffyChaiPartnerPayment(parsed, { sendEmails: false });
      results.push({
        paymentId: parsed.paymentId,
        email: parsed.email,
        amount: parsed.amountDollars,
        status: recorded.ok ? (recorded.duplicate ? 'duplicate' : 'recorded') : 'failed',
        partnerId: recorded.partnerId,
      });
    } catch (err) {
      console.error('[zeffy reconcile] record error', parsed.paymentId, err);
      results.push({
        paymentId: parsed.paymentId,
        email: parsed.email,
        amount: parsed.amountDollars,
        status: 'error',
      });
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: list.length,
    recorded: results.filter((r) => r.status === 'recorded').length,
    duplicates: results.filter((r) => r.status === 'duplicate').length,
    skippedNotChai: results.filter((r) => r.status === 'skipped_not_chai').length,
    results,
  });
}
