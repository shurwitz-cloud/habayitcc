'use server';

import { getOpenHouseEvent } from '@/lib/events/config';
import { appendRsvpToTab } from '@/lib/google/sheets';

const SHEET_IDS: Record<string, string | undefined> = {
  'hebrew-adventure': process.env.GOOGLE_SHEETS_HEBREW_SCHOOL_ID,
  'achim':            process.env.GOOGLE_SHEETS_ACHIM_ID,
  'bloom':            process.env.GOOGLE_SHEETS_BLOOM_ID,
};

export interface RsvpInput {
  slug: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  attending: number;
  notes: string;
}

export interface RsvpResult {
  success: boolean;
  error?: string;
}

export async function submitRsvp(input: RsvpInput): Promise<RsvpResult> {
  try {
    const event = getOpenHouseEvent(input.slug);
    if (!event) return { success: false, error: 'Event not found.' };

    const sheetId = SHEET_IDS[input.slug];
    if (!sheetId) {
      console.error(`[RSVP] No sheet ID configured for slug: ${input.slug}`);
      // Still return success — don't block the user if sheets isn't configured
    } else {
      await appendRsvpToTab(sheetId, event.tabName, {
        firstName: input.firstName,
        lastName:  input.lastName,
        email:     input.email,
        phone:     input.phone,
        attending: input.attending,
        notes:     input.notes,
      });
    }

    return { success: true };
  } catch (err) {
    console.error('[RSVP] submission error:', err);
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}
