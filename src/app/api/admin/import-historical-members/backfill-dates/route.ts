import { NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { backfillHistoricalImportDates } from '@/lib/admin/import-historical-members';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/admin/import-historical-members/backfill-dates
 * Rewrites created_at on imported RSVPs/contacts/audits from sheet timestamps
 * already stored in form_submissions payloads. Quiet — no emails.
 */
export async function POST() {
  const denied = await requireCapabilityApi('stripe_tools');
  if (denied) return denied;

  try {
    const stats = await backfillHistoricalImportDates();
    return NextResponse.json({
      success: true,
      quiet: true,
      emailsSent: false,
      stats,
    });
  } catch (err) {
    console.error('[backfill-historical-dates]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Backfill failed' },
      { status: 500 },
    );
  }
}
