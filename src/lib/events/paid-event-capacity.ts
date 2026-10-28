import { parseEventPeople } from '@/lib/admin/crm/event-registration-stats';
import {
  isPaidEventSoldOut,
  type PaidEventConfig,
} from '@/lib/events/paid-events';
import { createAdminClient } from '@/lib/supabase/server';

/** How many units this registration would take against event.capacity. */
export function paidEventUnitsFromInput(event: PaidEventConfig, input: {
  couples?: { couples?: number };
  dinner?: { adults?: number; kids?: number };
  fair?: { children?: unknown[] };
  womens?: { women?: number };
}): number {
  if (event.type === 'couples') {
    return Math.max(0, Math.round(Number(input.couples?.couples) || 0));
  }
  if (event.type === 'dinner' || event.type === 'celebration') {
    return Math.max(0, (input.dinner?.adults ?? 0) + (input.dinner?.kids ?? 0));
  }
  if (event.type === 'family-fair') {
    return Math.max(0, input.fair?.children?.length ?? 0);
  }
  if (event.type === 'womens') {
    return Math.max(0, input.womens?.women ?? 0);
  }
  return 0;
}

export async function countPaidEventUnits(slug: string): Promise<number> {
  const supabase = createAdminClient();
  // Do not select registration_details — that column is not on production yet.
  const { data, error } = await supabase
    .from('event_registrations')
    .select('guest_count, notes')
    .eq('event_slug', slug);

  if (error) {
    console.error('[paid-event-capacity] count failed:', error.message);
    throw error;
  }

  return (data ?? []).reduce((sum, row) => sum + parseEventPeople(row).guests, 0);
}

export async function isPaidEventClosed(event: PaidEventConfig): Promise<boolean> {
  if (isPaidEventSoldOut(event)) return true;
  if (event.capacity == null) return false;
  try {
    const sold = await countPaidEventUnits(event.slug);
    return sold >= event.capacity;
  } catch {
    return false;
  }
}

const CLOSED_MESSAGE = 'This event is sold out.';

export async function assertPaidEventHasRoom(
  event: PaidEventConfig,
  unitsToAdd: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isPaidEventSoldOut(event)) return { ok: false, error: CLOSED_MESSAGE };
  if (event.capacity == null) return { ok: true };

  let sold = 0;
  try {
    sold = await countPaidEventUnits(event.slug);
  } catch (err) {
    console.error('[paid-event-capacity] allowing registration; count unavailable:', err);
    return { ok: true };
  }

  if (sold >= event.capacity || sold + unitsToAdd > event.capacity) {
    return { ok: false, error: CLOSED_MESSAGE };
  }
  return { ok: true };
}
