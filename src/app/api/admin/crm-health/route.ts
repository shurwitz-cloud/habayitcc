import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/admin/auth';
import { createAdminClient, isServiceRoleConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const TABLES = [
  'contacts',
  'donations',
  'payments',
  'chai_partners',
  'event_registrations',
  'events',
  'families',
  'parents',
  'children',
  'program_registrations',
  'waivers',
  'form_submissions',
] as const;

/**
 * GET /api/admin/crm-health
 * Verifies service role key and that core CRM tables are readable.
 */
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hasServiceRole = isServiceRoleConfigured();
  const results: Record<string, { ok: boolean; error?: string }> = {};

  if (!hasServiceRole) {
    return NextResponse.json({
      ok: false,
      serviceRole: false,
      message: 'SUPABASE_SERVICE_ROLE_KEY is missing on Vercel.',
      tables: results,
    });
  }

  const supabase = createAdminClient();

  for (const table of TABLES) {
    const { error } = await supabase.from(table).select('id').limit(1);
    results[table] = error ? { ok: false, error: error.message } : { ok: true };
  }

  const allOk = Object.values(results).every((r) => r.ok);

  return NextResponse.json({
    ok: allOk,
    serviceRole: true,
    tables: results,
    hint: allOk
      ? undefined
      : 'Run scripts/apply-crm-migrations.mjs or paste supabase/migrations/0007_complete_crm_data.sql in Supabase SQL Editor.',
  });
}
