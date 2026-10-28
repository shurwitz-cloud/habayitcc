/** Admin offline tuition payment methods (accept without Stripe charge). */
export const OFFLINE_TUITION_METHODS = [
  'Zelle',
  'Cash',
  'Check',
  'Zeffy',
  'CC',
  'Other',
] as const;

export type OfflineTuitionMethod = (typeof OFFLINE_TUITION_METHODS)[number];

export function isOfflineTuitionMethod(value: string): value is OfflineTuitionMethod {
  return (OFFLINE_TUITION_METHODS as readonly string[]).includes(value);
}
