import { NextRequest, NextResponse } from 'next/server';
import { lookupHebrewBirthday, type SunsetTiming } from '@/lib/hebrew-birthday/hebcal-converter';
import { buildHebrewBirthdayNotes } from '@/lib/hebrew-birthday/notes';

export const runtime = 'nodejs';

/**
 * GET /api/hebrew-birthday?date=YYYY-MM-DD&sunset=before|after|unknown
 * Live Hebrew birthday lookup for registration forms.
 */
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date')?.trim() ?? '';
  const sunset = (req.nextUrl.searchParams.get('sunset')?.trim() ?? '') as SunsetTiming;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date.' }, { status: 400 });
  }

  try {
    const result = await lookupHebrewBirthday({
      dateOfBirth: date,
      bornSunsetTiming: sunset || undefined,
    });

    if (!result) {
      return NextResponse.json({ error: 'Could not convert date.' }, { status: 502 });
    }

    return NextResponse.json({
      english: result.english,
      hebrew: result.hebrew,
      note: buildHebrewBirthdayNotes(sunset || undefined),
    });
  } catch (err) {
    console.error('[hebrew-birthday]', err);
    return NextResponse.json({ error: 'Lookup failed.' }, { status: 500 });
  }
}
