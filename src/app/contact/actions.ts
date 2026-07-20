'use server';

import { logFormSubmission } from '@/lib/admin/form-log';
import { createAdminClient } from '@/lib/supabase/server';
import { assertSupabaseWriteReady } from '@/lib/supabase/require-write';
import { contactRow } from '@/lib/google/sheets';
import { sendContactEmails } from '@/lib/email/contact';

export interface ContactInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  interest: string;
  message: string;
}

export async function submitContactForm(
  input: ContactInput
): Promise<{ success: boolean; error?: string }> {
  const ready = assertSupabaseWriteReady();
  if (!ready.ok) return { success: false, error: ready.error };

  const email = input.email.trim().toLowerCase();
  if (!input.firstName.trim() || !input.lastName.trim() || !email) {
    return { success: false, error: 'Please fill in your name and email.' };
  }

  try {
    await logFormSubmission({
      formType: 'contact',
      email,
      payload: input,
    });

    const supabase = createAdminClient();

    const { data: contact, error } = await supabase
      .from('contacts')
      .insert({
        first_name: input.firstName.trim(),
        last_name: input.lastName.trim(),
        email,
        phone: input.phone?.trim() || null,
        interest: input.interest?.trim() || null,
        message: input.message?.trim() || null,
      })
      .select('id')
      .single();

    if (error || !contact) {
      console.error('Contact form insert error:', error);
      return { success: false, error: 'Could not save your message. Please try again.' };
    }

    void logFormSubmission({
      formType: 'contact',
      email,
      sourceId: contact.id,
      payload: input,
    });

    void contactRow({
      firstName: input.firstName,
      lastName: input.lastName,
      email,
      phone: input.phone,
      interest: input.interest,
      message: input.message,
    });

    await sendContactEmails({ ...input, email });

    return { success: true };
  } catch (err) {
    console.error('Contact form error:', err);
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}
