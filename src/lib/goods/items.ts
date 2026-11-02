/**
 * Goods / Services / Classes item catalog for non-donation payments.
 * The CRM form offers these presets plus an "Other" free-text label;
 * the server accepts any non-empty label so the list can grow
 * without a code change.
 */
export const GOODS_ITEM_PRESETS = [
  'Bar Mitzvah Classes',
  'Torah Study Classes',
  'Mezuzot',
] as const;

export const GOODS_OTHER_ITEM = 'Other';

export function resolveGoodsItemLabel(
  item?: string | null,
  customItem?: string | null,
): string | null {
  const raw = (item ?? '').trim();
  if (!raw) return null;
  if (raw === GOODS_OTHER_ITEM) {
    const custom = (customItem ?? '').trim();
    return custom || null;
  }
  return raw;
}
