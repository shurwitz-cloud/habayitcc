'use server';

import { createAdminClient } from '@/lib/supabase/server';
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
  try {
    const supabase = createAdminClient();

    const { error } = await supabase.from('contacts').insert({
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      phone: input.phone || null,
      interest: input.interest || null,
      message: input.message || null,
    });

    if (error) {
      console.error('Contact form insert error:', error);
      return { success: false, error: 'Could not save your message. Please try again.' };
    }

    // Append to Google Sheets (best-effort — never blocks the response)
    void contactRow({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      interest: input.interest,
      message: input.message,
    });

    void sendContactEmails(input);

    return { success: true };
  } catch (err) {
    console.error('Contact form error:', err);
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}
