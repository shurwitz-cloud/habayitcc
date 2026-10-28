import type { SunsetTiming } from '@/lib/hebrew-birthday/hebcal-converter';

export function buildHebrewBirthdayNotes(bornSunsetTiming: SunsetTiming): string {
  if (bornSunsetTiming === 'before') {
    return 'Born before sunset.';
  }

  if (bornSunsetTiming === 'after') {
    return 'Born after sunset.';
  }

  if (bornSunsetTiming === 'unknown') {
    return 'Sunset timing unknown — Hebrew birthday may be either date shown.';
  }

  return 'Sunset timing not provided — Hebrew birthday may be either date shown.';
}
