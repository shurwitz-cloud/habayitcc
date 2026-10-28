'use server';

import { logFormSubmission } from '@/lib/admin/form-log';
import { findFamilyIdByEmail } from '@/lib/families/lookup';
import { getOpenHouseEvent } from '@/lib/events/config';
import { ensureEventBySlug } from '@/lib/events/sync';
import { appendRsvpToTab } from '@/lib/google/sheets';
import { sendRsvpConfirmationEmail } from '@/lib/email/rsvp-confirmation';
import { createAdminClient } from '@/lib/supabase/server';
import { assertSupabaseWriteReady } from '@/lib/supabase/require-write';
import { insertWithSchemaFallback } from '@/lib/supabase/insert-helpers';
import { ensureCrmContact } from '@/lib/admin/ensure-contact';
import { enforceActionRateLimit } from '@/lib/security/action-rate-limit';

const SHEET_IDS: Record<string, string | undefined> = {
  'hebrew-adventure': process.env.GOOGLE_SHEETS_HEBREW_SCHOOL_ID,
  achim: process.env.GOOGLE_SHEETS_ACHIM_ID,
  bmx: process.env.GOOGLE_SHEETS_BMX_ID || '1agGNODdOzVy2VioqSRcQ4f9245GVS3TWsbG1wB3hIPk',
  bloom: process.env.GOOGLE_SHEETS_BLOOM_ID,
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
  const limited = await enforceActionRateLimit('rsvp', 15, 15 * 60 * 1000);
  if (!limited.ok) return { success: false, error: limited.error };

  const ready = assertSupabaseWriteReady();
  if (!ready.ok) return { success: false, error: ready.error };

  try {
    const event = getOpenHouseEvent(input.slug);
    if (!event) return { success: false, error: 'Event not found.' };

    const email = input.email.trim().toLowerCase();
    if (!input.firstName.trim() || !input.lastName.trim() || !email) {
      return { success: false, error: 'Please fill in your name and email.' };
    }
    if (!input.attending || input.attending < 1) {
      return { success: false, error: 'Please enter how many guests are attending.' };
    }

    await logFormSubmission({
      formType: 'rsvp',
      email,
      payload: { ...input, eventTitle: event.title },
    });

    const eventId = await ensureEventBySlug(input.slug);
    if (!eventId) {
      console.error('[RSVP] Could not sync event to database:', input.slug);
      return { success: false, error: 'Could not save your RSVP. Please contact us.' };
    }

    const supabase = createAdminClient();
    const familyId = await findFamilyIdByEmail(email);

    const row = {
      event_id: eventId,
      event_slug: input.slug,
      family_id: familyId,
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      email,
      phone: input.phone?.trim() || null,
      guest_count: input.attending,
      notes: input.notes?.trim() || null,
    };

    const rsvpResult = await insertWithSchemaFallback(row, async (payload) =>
      supabase.from('event_registrations').insert(payload).select('id').single()
    );
    const rsvpRow = rsvpResult.data as { id: string } | null;
    const rsvpError = rsvpResult.error;

    if (rsvpError || !rsvpRow) {
      console.error('[RSVP] Supabase insert error:', rsvpError);
      return { success: false, error: 'Could not save your RSVP. Please try again.' };
    }

    await ensureCrmContact({
      firstName: input.firstName,
      lastName: input.lastName,
      email,
      phone: input.phone,
      interest: event.title,
      note: `--- RSVP: ${event.title} ---\nGuests: ${input.attending}`,
      isResolved: true,
    });

    void logFormSubmission({
      formType: 'rsvp',
      email,
      sourceId: rsvpRow.id,
      payload: { ...input, eventTitle: event.title },
    });

    const sheetId = SHEET_IDS[input.slug];
    if (!sheetId) {
      console.error(`[RSVP] No sheet ID configured for slug: ${input.slug}`);
    } else {
      // Await so Vercel doesn't freeze the isolate before Sheets finishes.
      try {
        await appendRsvpToTab(sheetId, event.tabName, {
          firstName: input.firstName,
          lastName: input.lastName,
          email,
          phone: input.phone,
          attending: input.attending,
          notes: input.notes,
        });
      } catch (sheetErr) {
        console.error('[RSVP] Sheets append failed (RSVP still saved):', sheetErr);
      }
    }

    try {
      await sendRsvpConfirmationEmail({
        event,
        firstName: input.firstName,
        lastName: input.lastName,
        email,
        phone: input.phone,
        attending: input.attending,
        notes: input.notes,
      });
    } catch (emailErr) {
      console.error('[RSVP] Email failed (RSVP still saved):', emailErr);
    }

    return { success: true };
  } catch (err) {
    console.error('[RSVP] submission error:', err);
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}
