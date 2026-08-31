import { NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { syncAllImportantDatesFromDb } from '@/lib/hebrew-birthday/sync-important-dates-sheet';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/admin/sync-important-dates-sheet
 * Push all CRM birthdays and yahrzeit rows to Google Sheets.
 */
export async function POST() {
  const denied = await requireCapabilityApi('registrations');
  if (denied) return denied;

  try {
    const result = await syncAllImportantDatesFromDb();
    return NextResponse.json({
      ok: true,
      ...result,
      message: `Synced ${result.synced} row(s) to Google Sheets.`,
    });
  } catch (err) {
    console.error('[sync-important-dates-sheet]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync failed.' },
      { status: 500 },
    );
  }
}
