import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { createAdminClient } from '@/lib/supabase/server';
import { parseAdultsKidsFromNotes } from '@/lib/admin/crm/event-registration-stats';

export const dynamic = 'force-dynamic';

/**
 * Backfill registration_details.dinner adults/kids from notes
 * ("Adults: X\\nChildren: Y") when missing or zeroed.
 *
 * POST /api/admin/backfill-event-adults-kids
 * Body: { confirm: true, eventSlug?: string }
 */
export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;

  let body: { confirm?: boolean; eventSlug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  if (body.confirm !== true) {
    return NextResponse.json({ error: 'Pass { confirm: true }.' }, { status: 400 });
  }

  const eventSlug = (body.eventSlug ?? '').trim();
  const supabase = createAdminClient();

  let query = supabase
    .from('event_registrations')
    .select('id, event_slug, guest_count, notes, registration_details')
    .not('notes', 'is', null)
    .order('created_at', { ascending: false });

  if (eventSlug) query = query.eq('event_slug', eventSlug);

  const { data: rows, error } = await query.limit(2000);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  const samples: Array<{ id: string; email?: string; adults: number; kids: number }> = [];

  for (const row of rows || []) {
    scanned += 1;
    const parsed = parseAdultsKidsFromNotes(row.notes);
    if (!parsed || (parsed.adults <= 0 && parsed.kids <= 0)) {
      skipped += 1;
      continue;
    }

    const existing =
      row.registration_details && typeof row.registration_details === 'object'
        ? ({ ...(row.registration_details as Record<string, unknown>) } as Record<string, unknown>)
        : {};

    const dinnerRaw =
      existing.dinner && typeof existing.dinner === 'object'
        ? (existing.dinner as Record<string, unknown>)
        : {};
    const existingAdults = Number(dinnerRaw.adults);
    const existingKids = Number(dinnerRaw.kids);
    const hasUsefulDinner =
      (Number.isFinite(existingAdults) && existingAdults > 0) ||
      (Number.isFinite(existingKids) && existingKids > 0);

    if (hasUsefulDinner) {
      skipped += 1;
      continue;
    }

    const nextDetails = {
      ...existing,
      type: existing.type || 'celebration',
      dinner: {
        ...dinnerRaw,
        adults: parsed.adults,
        kids: parsed.kids,
      },
    };

    const guestCount = Math.max(
      1,
      Number(row.guest_count) || 0,
      parsed.adults + parsed.kids,
    );

    const { error: updateError } = await supabase
      .from('event_registrations')
      .update({
        registration_details: nextDetails,
        guest_count: guestCount,
      })
      .eq('id', row.id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message, failedId: row.id, updated },
        { status: 500 },
      );
    }

    updated += 1;
    if (samples.length < 15) {
      samples.push({ id: row.id, adults: parsed.adults, kids: parsed.kids });
    }
  }

  return NextResponse.json({
    ok: true,
    eventSlug: eventSlug || null,
    scanned,
    updated,
    skipped,
    samples,
  });
}
