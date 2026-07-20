import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/admin/auth';
import { reconcileStripeDonations } from '@/lib/donations/reconcile-stripe';
import { isServiceRoleConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/reconcile-stripe?days=30
 * Re-imports donations from Stripe into Supabase CRM (idempotent).
 * Requires full admin (not volunteer).
 */
export async function POST(req: Request) {
  if (!(await requireCapability('stripe_tools'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!isServiceRoleConfigured()) {
    return NextResponse.json(
      {
        error:
          'SUPABASE_SERVICE_ROLE_KEY is not configured on Vercel. Add it in Project Settings → Environment Variables, redeploy, then run reconcile again.',
      },
      { status: 503 }
    );
  }

  const days = Number(new URL(req.url).searchParams.get('days') ?? '30');
  const result = await reconcileStripeDonations(Number.isFinite(days) ? days : 30);

  return NextResponse.json({
    ok: true,
    ...result,
    message: `Scanned ${result.scanned} Stripe records. Imported ${result.imported}, skipped ${result.skipped}, failed ${result.failed}.`,
    failures: result.items.filter((i) => i.status === 'failed'),
  });
}
