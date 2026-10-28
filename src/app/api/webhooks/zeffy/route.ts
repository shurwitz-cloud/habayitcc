import { NextRequest, NextResponse } from 'next/server';
import {
  ZEFFY_INBOUND_DISABLED_MESSAGE,
  ZEFFY_INBOUND_ENABLED,
} from '@/lib/zeffy/inbound';
import { productionWebhookGetBlocked } from '@/lib/security/production-only';

export const dynamic = 'force-dynamic';

/**
 * Zeffy → HaBayit webhook (inbound sync disabled).
 * Chai Partner checkout still redirects donors to Zeffy; staff add partners manually in CRM.
 * Remove or disable this URL in Zeffy Integrations if still configured.
 */
export async function POST(req: NextRequest) {
  if (!ZEFFY_INBOUND_ENABLED) {
    console.info('[zeffy webhook] inbound sync disabled — payload ignored');
    return NextResponse.json({
      received: true,
      handled: false,
      reason: 'inbound_disabled',
      message: ZEFFY_INBOUND_DISABLED_MESSAGE,
    });
  }

  return NextResponse.json(
    { error: 'Zeffy inbound is not configured.' },
    { status: 503 }
  );
}

export async function GET() {
  const blocked = productionWebhookGetBlocked();
  if (blocked) return blocked;

  return NextResponse.json({
    ok: true,
    inboundEnabled: ZEFFY_INBOUND_ENABLED,
    endpoint: '/api/webhooks/zeffy',
    message: ZEFFY_INBOUND_ENABLED
      ? 'POST payment.completed payloads from Zeffy Integrations.'
      : ZEFFY_INBOUND_DISABLED_MESSAGE,
  });
}
