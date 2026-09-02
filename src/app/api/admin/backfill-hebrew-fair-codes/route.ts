import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/admin/auth';
import { ensureHebrewFairCodesForAll } from '@/lib/events/hebrew-fair-codes';

/**
 * POST /api/admin/backfill-hebrew-fair-codes
 * Assign HA- codes to accepted/active Hebrew Adventure children missing one.
 */
export async function POST() {
  if (!(await requireCapability('registrations'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await ensureHebrewFairCodesForAll();
    if (result.error || result.migrationRequired) {
      return NextResponse.json(
        {
          ok: false,
          created: result.created,
          total: result.total,
          codes: result.codes,
          error: result.error ?? 'Backfill blocked.',
          migrationRequired: result.migrationRequired ?? false,
          hint: result.hint,
        },
        { status: result.migrationRequired ? 409 : 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      created: result.created,
      total: result.total,
      codes: result.codes,
    });
  } catch (err) {
    console.error('[backfill-hebrew-fair-codes]', err);
    return NextResponse.json({ error: 'Backfill failed.' }, { status: 500 });
  }
}
