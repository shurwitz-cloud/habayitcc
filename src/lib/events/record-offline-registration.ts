import { logFormSubmission } from '@/lib/admin/form-log';
import { findFamilyIdByEmail } from '@/lib/families/lookup';
import { ensureEventBySlug } from '@/lib/events/sync';
import { appendPaidEventRow } from '@/lib/google/sheets';
import { getPaidEvent, getPaidEventSheetId } from '@/lib/events/paid-events';
import { ensureCrmContact } from '@/lib/admin/ensure-contact';
import { createAdminClient } from '@/lib/supabase/server';
import { assertSupabaseWriteReady } from '@/lib/supabase/require-write';
import { insertWithSchemaFallback } from '@/lib/supabase/insert-helpers';

export type OfflineEventPaymentMethod = 'Zelle' | 'Cash' | 'Check' | 'Cash App' | 'Other';

export type RecordOfflineEventRegistrationInput = {
  slug: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  amount: number;
  paymentMethod: OfflineEventPaymentMethod;
  guestCount?: number;
  notes?: string | null;
};

export type RecordOfflineEventRegistrationResult = {
  success: boolean;
  alreadyExisted?: boolean;
  id?: string;
  error?: string;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function recordOfflinePaidEventRegistration(
  input: RecordOfflineEventRegistrationInput,
): Promise<RecordOfflineEventRegistrationResult> {
  const ready = assertSupabaseWriteReady();
  if (!ready.ok) return { success: false, error: ready.error };

  const event = getPaidEvent(input.slug);
  if (!event) return { success: false, error: 'Event not found.' };

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) {
    return { success: false, error: 'First and last name are required.' };
  }

  const amount = roundMoney(Number(input.amount));
  if (!Number.isFinite(amount) || amount < 0) {
    return { success: false, error: 'Amount must be a valid number.' };
  }

  const guestCount = Math.max(1, Math.round(Number(input.guestCount) || 1));
  const paymentMethod = input.paymentMethod;
  let email = (input.email || '').trim().toLowerCase() || null;
  let phone = (input.phone || '').trim() || null;

  const supabase = createAdminClient();

  if (!email || !phone) {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('email, phone')
      .ilike('first_name', firstName)
      .ilike('last_name', lastName)
      .limit(5);
    const match = contacts?.[0];
    if (match) {
      email = email || (match.email || '').trim().toLowerCase() || null;
      phone = phone || (match.phone || '').trim() || null;
    }
    if (!email || !phone) {
      const { data: parents } = await supabase
        .from('parents')
        .select('email, phone')
        .ilike('first_name', firstName)
        .ilike('last_name', lastName)
        .limit(5);
      const parent = parents?.[0];
      if (parent) {
        email = email || (parent.email || '').trim().toLowerCase() || null;
        phone = phone || (parent.phone || '').trim() || null;
      }
    }
  }

  const eventId = await ensureEventBySlug(event.slug);
  if (!eventId) return { success: false, error: 'Could not save registration.' };

  const { data: existing } = await supabase
    .from('event_registrations')
    .select('id')
    .eq('event_id', eventId)
    .ilike('first_name', firstName)
    .ilike('last_name', lastName)
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    return { success: true, alreadyExisted: true, id: existing.id };
  }

  const familyId = email ? await findFamilyIdByEmail(email) : null;
  const paidNote = `Paid $${amount.toFixed(2)} via ${paymentMethod}`;
  const detailsSummary =
    event.type === 'womens'
      ? `Women attending: ${guestCount}\n${paidNote}`
      : event.type === 'dinner'
        ? `Guests: ${guestCount}\n${paidNote}`
        : `Children: ${guestCount}\n${paidNote}`;
  const extraNotes = (input.notes || '').trim();
  const notes = extraNotes ? `${detailsSummary}\n${extraNotes}` : detailsSummary;

  const registrationDetails = {
    type: event.type,
    womens: event.type === 'womens' ? { women: guestCount } : undefined,
    dinner: event.type === 'dinner' ? { adults: guestCount, kids: 0 } : undefined,
    fair: event.type === 'family-fair' ? { children: Array.from({ length: guestCount }, () => ({})) } : undefined,
    ticketSubtotal: amount,
    coverFee: false,
    paymentMethod,
  };

  const row = {
    event_id: eventId,
    event_slug: event.slug,
    family_id: familyId,
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    guest_count: guestCount,
    notes,
    amount,
    sponsor_amount: 0,
    card_fee: 0,
    stripe_payment_intent_id: null,
    registration_details: registrationDetails,
  };

  const regResult = await insertWithSchemaFallback(row, async (payload) =>
    supabase.from('event_registrations').insert(payload).select('id').single(),
  );
  if (regResult.error || !regResult.data) {
    console.error('[offline event] insert error:', regResult.error);
    return { success: false, error: 'Could not save registration.' };
  }

  const id = (regResult.data as { id: string }).id;

  await logFormSubmission({
    formType: 'rsvp',
    email,
    sourceId: id,
    payload: {
      slug: event.slug,
      eventTitle: event.title,
      firstName,
      lastName,
      email,
      phone,
      coverFee: false,
      sponsorAmount: 0,
      paymentMethod,
      offline: true,
      womens: event.type === 'womens' ? { women: guestCount } : undefined,
      pricing: {
        ticketSubtotal: amount,
        sponsorAmount: 0,
        cardFee: 0,
        total: amount,
      },
    },
  });

  if (email) {
    await ensureCrmContact({
      firstName,
      lastName,
      email,
      phone,
      interest: event.title,
      note: `--- ${event.title} ---\n${notes}\nTotal: $${amount.toFixed(2)}`,
      isResolved: true,
    });
  }

  const sheetId = getPaidEventSheetId(event);
  if (sheetId) {
    const timestamp = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    try {
      if (event.type === 'womens') {
        await appendPaidEventRow(sheetId, 'womens', [
          timestamp,
          lastName,
          firstName,
          email ?? '',
          phone ?? '',
          guestCount,
          `$${amount.toFixed(2)}`,
          '',
          '',
          `$${amount.toFixed(2)}`,
          paymentMethod,
        ]);
      } else if (event.type === 'dinner') {
        await appendPaidEventRow(sheetId, 'dinner', [
          timestamp,
          lastName,
          firstName,
          email ?? '',
          phone ?? '',
          guestCount,
          0,
          `$${amount.toFixed(2)}`,
          '',
          '',
          `$${amount.toFixed(2)}`,
          paymentMethod,
        ]);
      } else {
        await appendPaidEventRow(sheetId, 'family-fair', [
          timestamp,
          lastName,
          firstName,
          email ?? '',
          phone ?? '',
          guestCount,
          paymentMethod,
          `$${amount.toFixed(2)}`,
          '',
          '',
          `$${amount.toFixed(2)}`,
          paymentMethod,
        ]);
      }
    } catch (sheetErr) {
      console.error('[offline event] Sheets append failed:', sheetErr);
    }
  }

  return { success: true, id };
}
