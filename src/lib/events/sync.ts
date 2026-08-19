import { createAdminClient } from '@/lib/supabase/server';
import { insertWithSchemaFallback } from '@/lib/supabase/insert-helpers';
import { getOpenHouseEvent } from '@/lib/events/config';
import { getPaidEvent } from '@/lib/events/paid-events';

function getEventConfigForSync(slug: string) {
  const openHouse = getOpenHouseEvent(slug);
  if (openHouse) {
    return {
      title: openHouse.title,
      description: openHouse.description,
      startsAt: openHouse.startsAt,
      locationPrivate: openHouse.locationPrivate,
      locationAddress: openHouse.locationAddress,
    };
  }

  const paid = getPaidEvent(slug);
  if (paid) {
    return {
      title: paid.title,
      description: paid.description,
      startsAt: paid.startsAt,
      locationPrivate: false,
      locationAddress: undefined as string | undefined,
    };
  }

  return null;
}

/**
 * Ensures an event exists in Supabase for RSVP / paid registration persistence.
 * Upserts by slug so config stays the source of truth for display metadata.
 */
export async function ensureEventBySlug(slug: string): Promise<string | null> {
  const config = getEventConfigForSync(slug);
  if (!config) return null;

  const supabase = createAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from('events')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (existing?.id) return existing.id;

  if (!existingError) {
    // no row found — continue to insert
  } else if (!/slug/i.test(existingError.message)) {
    console.error('[ensureEventBySlug] lookup error:', existingError.message);
  }

  const location = config.locationPrivate
    ? 'Provided upon registration'
    : config.locationAddress ?? 'HaBayit Jewish Center';

  const row = {
    slug,
    title: config.title,
    description: config.description,
    starts_at: config.startsAt,
    location,
    is_published: true,
  };

  const { data, error } = await insertWithSchemaFallback(row, async (payload) =>
    supabase.from('events').insert(payload).select('id').single()
  );

  if (error) {
    const { data: retry } = await supabase
      .from('events')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (retry?.id) return retry.id;

    const { data: byTitle } = await supabase
      .from('events')
      .select('id')
      .eq('title', config.title)
      .maybeSingle();
    return byTitle?.id ?? null;
  }

  return (data as { id: string } | null)?.id ?? null;
}
