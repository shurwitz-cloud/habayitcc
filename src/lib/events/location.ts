import type { EventConfig } from './config';

/** Short hint shown before RSVP (header, form note). */
export function registrationLocationHint(event: EventConfig): string | null {
  if (event.locationAddress) {
    return 'Venue address provided upon registration.';
  }
  if (event.locationPrivate) {
    return 'Location provided upon registration.';
  }
  return null;
}

export function formatLocationAddressHtml(address: string): string {
  return address
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('<br>');
}

export function formatLocationAddressText(address: string): string {
  return address
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(', ');
}

/** Stored on the event record when we know the address at RSVP time. */
export function eventRecordLocation(event: EventConfig): string {
  if (event.locationAddress) {
    return formatLocationAddressText(event.locationAddress);
  }
  if (event.locationPrivate) {
    return 'Provided upon registration';
  }
  return 'HaBayit Jewish Center';
}
