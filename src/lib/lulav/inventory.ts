import 'server-only';

import { createAdminClient } from '@/lib/supabase/server';

export const LULAV_INVENTORY_LIMIT = 19;
export const LULAV_INVENTORY_START = '2026-09-22T18:29:00.000Z';

export async function getLulavRemainingInventory(): Promise<number> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('form_submissions')
    .select('payload')
    .eq('form_type', 'lulav_order')
    .is('source_id', null)
    .gte('created_at', LULAV_INVENTORY_START);

  if (error) {
    console.error('[lulav] inventory lookup failed:', error);
    return 0;
  }

  const ordered = (data ?? []).reduce((total, row) => {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const status = String(payload.status ?? '').toLowerCase();
    if (status === 'cancelled' || status === 'refunded') return total;
    return total + Math.max(0, Math.floor(Number(payload.quantity) || 0));
  }, 0);

  return Math.max(0, LULAV_INVENTORY_LIMIT - ordered);
}

export async function validateLulavInventory(
  quantity: number,
): Promise<{ ok: true; remaining: number } | { ok: false; error: string; remaining: number }> {
  const remaining = await getLulavRemainingInventory();
  if (remaining <= 0) {
    return {
      ok: false,
      remaining: 0,
      error: 'Currently sold out. Please contact Rabbi Shmuly at 646-462-1138.',
    };
  }
  if (quantity > remaining) {
    return {
      ok: false,
      remaining,
      error: `Only ${remaining} set${remaining === 1 ? '' : 's'} remaining.`,
    };
  }
  return { ok: true, remaining };
}
