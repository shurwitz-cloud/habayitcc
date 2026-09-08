'use server';

import { logFormSubmission } from '@/lib/admin/form-log';
import { assertSupabaseWriteReady } from '@/lib/supabase/require-write';
import { enforceActionRateLimit } from '@/lib/security/action-rate-limit';
import { sendSeniorHomePermissionEmails } from '@/lib/email/senior-home-permission';

export interface SeniorHomePermissionInput {
  childName: string;
  parentName: string;
  email: string;
  permissionYes: boolean;
}

export async function submitSeniorHomePermission(
  input: SeniorHomePermissionInput
): Promise<{ success: boolean; error?: string }> {
  const limited = await enforceActionRateLimit(
    'senior-home-permission',
    12,
    15 * 60 * 1000
  );
  if (!limited.ok) return { success: false, error: limited.error };

  const ready = assertSupabaseWriteReady();
  if (!ready.ok) return { success: false, error: ready.error };

  const childName = input.childName.trim();
  const parentName = input.parentName.trim();
  const email = input.email.trim().toLowerCase();

  if (!childName || !parentName || !email) {
    return { success: false, error: 'Please fill in the child’s name, your name, and email.' };
  }
  if (!input.permissionYes) {
    return {
      success: false,
      error: 'Please confirm permission to participate.',
    };
  }

  const payload = {
    childName,
    parentName,
    email,
    permissionYes: true,
    event: 'senior_home_visit',
  };

  try {
    const logged = await logFormSubmission({
      formType: 'senior_home_permission',
      email,
      payload,
    });

    if (!logged.ok) {
      return {
        success: false,
        error: 'Could not save your permission form. Please try again.',
      };
    }

    void logFormSubmission({
      formType: 'senior_home_permission',
      email,
      sourceId: logged.id,
      payload,
    });

    await sendSeniorHomePermissionEmails({
      childName,
      parentName,
      email,
    });

    return { success: true };
  } catch (err) {
    console.error('Senior home permission form error:', err);
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}
