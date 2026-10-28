import { createAdminClient } from '@/lib/supabase/server';

/** Link submissions to an existing family when email matches a parent record. */
export async function findFamilyIdByEmail(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('parents')
    .select('family_id')
    .ilike('email', normalized)
    .limit(1)
    .maybeSingle();

  return data?.family_id ?? null;
}
