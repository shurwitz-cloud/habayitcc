import type { CrmEventRecord } from './types';

/**
 * Events shown as quick sub-tabs under Events / RSVPs:
 * - all events starting in the next 30 days, if that set is larger than 6
 * - otherwise the next 6 upcoming events (even if some are beyond 30 days)
 */
export function pickEventTabList(
  events: CrmEventRecord[],
  now = new Date(),
): CrmEventRecord[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const in30 = new Date(startOfToday.getTime() + 30 * 86400000);

  const upcoming = [...events]
    .filter((e) => new Date(e.startsAt) >= startOfToday)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  const within30 = upcoming.filter((e) => new Date(e.startsAt) <= in30);
  if (within30.length > 6) return within30;
  return upcoming.slice(0, 6);
}

/** Events not in the quick tab list (past + farther future) for the “find past” picker. */
export function eventsOutsideTabs(
  events: CrmEventRecord[],
  tabs: CrmEventRecord[],
): CrmEventRecord[] {
  const tabIds = new Set(tabs.map((t) => t.id));
  return [...events]
    .filter((e) => !tabIds.has(e.id))
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
}
