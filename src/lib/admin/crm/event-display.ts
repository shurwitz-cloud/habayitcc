import { getPaidEvent, type PaidEventPeopleMode, type PaidEventType } from '@/lib/events/paid-events';

/**
 * How CRM counts people for an event.
 * Source of truth: PaidEventConfig.peopleMode (and default for open houses).
 */
export type EventPeopleMode = PaidEventPeopleMode;

/** Default for open houses and any event without a paid type. */
export const DEFAULT_EVENT_PEOPLE_MODE: EventPeopleMode = 'people';

const PAID_TYPE_FALLBACK: Record<PaidEventType, EventPeopleMode> = {
  womens: 'people',
  dinner: 'adults_kids',
  'family-fair': 'kids',
};

export function peopleModeForPaidType(type: PaidEventType): EventPeopleMode {
  return PAID_TYPE_FALLBACK[type];
}

export function resolveEventPeopleMode(slug: string | null | undefined): EventPeopleMode {
  if (!slug) return DEFAULT_EVENT_PEOPLE_MODE;
  const paid = getPaidEvent(slug);
  if (paid?.peopleMode) return paid.peopleMode;
  if (paid) return peopleModeForPaidType(paid.type);
  return DEFAULT_EVENT_PEOPLE_MODE;
}

export function eventShowsAdults(mode: EventPeopleMode): boolean {
  return mode === 'adults_kids';
}

export function eventShowsKids(mode: EventPeopleMode): boolean {
  return mode === 'adults_kids' || mode === 'kids';
}
