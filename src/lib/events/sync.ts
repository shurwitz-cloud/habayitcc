import { createAdminClient } from '@/lib/supabase/server';
import { insertWithSchemaFallback } from '@/lib/supabase/insert-helpers';
import { getOpenHouseEvent } from '@/lib/events/config';
import { eventRecordLocation } from '@/lib/events/location';

/**
 * Ensures an open-house event exists in Supabase for RSVP persistence.
 * Upserts by slug so config stays the source of truth for display metadata.
 */
export async function ensureEventBySlug(slug: string): Promise<string | null> {
  const config = getOpenHouseEvent(slug);
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

  const location = eventRecordLocation(config);

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
