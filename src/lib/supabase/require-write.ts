import { isServiceRoleConfigured } from '@/lib/supabase/server';

export const SUPABASE_WRITE_ERROR =
  'Our database is temporarily unavailable. Please try again in a few minutes or email info@habayitcc.org.';

export function assertSupabaseWriteReady():
  | { ok: true }
  | { ok: false; error: string } {
  if (!isServiceRoleConfigured()) {
    console.error(
      '[supabase] SUPABASE_SERVICE_ROLE_KEY is missing — visitor submissions cannot be saved.'
    );
    return { ok: false, error: SUPABASE_WRITE_ERROR };
  }
  return { ok: true };
}
