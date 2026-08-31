import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { backfillHebrewBirthdays } from '@/lib/hebrew-birthday/backfill-all';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/admin/backfill-hebrew-birthdays
 * Compute Hebrew birthdays for children with date_of_birth (Hebcal + sunset timing).
 */
export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('registrations');
  if (denied) return denied;

  const force = req.nextUrl.searchParams.get('force') === '1';

  try {
    const result = await backfillHebrewBirthdays({ force });
    return NextResponse.json({
      ok: true,
      ...result,
      message: result.updated
        ? `Updated ${result.updated} Hebrew birthday record(s).`
        : 'No children needed Hebrew birthday backfill.',
    });
  } catch (err) {
    console.error('[backfill-hebrew-birthdays]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Backfill failed.' },
      { status: 500 },
    );
  }
}
