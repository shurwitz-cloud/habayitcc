import { createAdminClient } from '@/lib/supabase/server';
import { isServiceRoleConfigured } from '@/lib/supabase/server';
import { isSchemaColumnError } from '@/lib/supabase/insert-helpers';

export type FormType =
  | 'contact'
  | 'donation'
  | 'chai_partner'
  | 'hebrew_adventure_registration'
  | 'achim_registration'
  | 'rsvp'
  | 'other';

/**
 * Raw audit log — call as early as possible in every visitor form handler
 * so payload is preserved even if structured table inserts fail.
 */
export async function logFormSubmission(input: {
  formType: FormType;
  email?: string | null;
  sourceId?: string | null;
  payload: Record<string, unknown> | object;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!isServiceRoleConfigured()) {
    const message = 'form_submissions: SUPABASE_SERVICE_ROLE_KEY not configured';
    console.error('[form-log]', message);
    return { ok: false, error: message };
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('form_submissions')
      .insert({
        form_type: input.formType,
        email: input.email?.trim().toLowerCase() || null,
        source_id: input.sourceId ?? null,
        payload: input.payload as Record<string, unknown>,
      })
      .select('id')
      .single();

    if (error) {
      if (isSchemaColumnError(error.message) && error.message.includes('form_submissions')) {
        console.error(
          '[form-log] form_submissions table or columns missing — run migration 0007 in Supabase SQL Editor.'
        );
      } else {
        console.error('[form-log] insert failed:', error.message);
      }
      return { ok: false, error: error.message };
    }

    return { ok: true, id: data?.id };
  } catch (err) {
    console.error('[form-log] failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
