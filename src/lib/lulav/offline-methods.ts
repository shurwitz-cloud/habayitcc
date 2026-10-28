/** Admin methods when marking a pending Lulav order paid. */
export const LULAV_OFFLINE_METHODS = [
  'Zelle',
  'Cash',
  'Zeffy',
  'Check',
  'Other',
] as const;

export type LulavOfflineMethod = (typeof LULAV_OFFLINE_METHODS)[number];

export function isLulavOfflineMethod(value: string): value is LulavOfflineMethod {
  return (LULAV_OFFLINE_METHODS as readonly string[]).includes(value);
}
