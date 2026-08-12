import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { createAdminClient } from '@/lib/supabase/server';
import { repairChaiPartnerNames } from '@/lib/admin/repair-chai-names';
import { repairUnknownContactNames } from '@/lib/admin/repair-unknown-contacts';

export const runtime = 'nodejs';
export const maxDuration = 300;

const SAMPLE = [
  'scdalmao@gmail.com',
  'chayale93@gmail.com',
  'adrian@amgad.com',
  'yakovbren@gmail.com',
  'gurshrenker@gmail.com',
  'etaitarazi@yahoo.com',
  'adir@adiry.com',
  'zev@renegadefurniture.com',
  'pessyr@gmail.com',
  'tamir@noetic.io',
];

async function runRepair() {
  const [partners, orphans] = await Promise.all([
    repairChaiPartnerNames(),
    repairUnknownContactNames(),
  ]);
  return {
    success: true,
    quiet: true,
    emailsSent: false,
    stats: { partners, orphans },
  };
}

/** GET — diagnose; pass ?apply=1 to run name repair (admin session). */
export async function GET(req: NextRequest) {
  const denied = await requireCapabilityApi('stripe_tools');
  if (denied) return denied;

  if (req.nextUrl.searchParams.get('apply') === '1') {
    try {
      return NextResponse.json(await runRepair());
    } catch (err) {
      console.error('[repair-chai-names]', err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Repair failed' },
        { status: 500 },
      );
    }
  }

  const supabase = createAdminClient();
  const rows = [];

  for (const email of SAMPLE) {
    const { data: partners } = await supabase
      .from('chai_partners')
      .select('id, first_name, last_name, email, status, created_at')
      .ilike('email', email);
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, interest, created_at')
      .ilike('email', email);
    const { data: subs } = await supabase
      .from('form_submissions')
      .select('form_type, created_at, payload')
      .ilike('email', email)
      .order('created_at', { ascending: false })
      .limit(3);

    rows.push({
      email,
      partners: partners || [],
      contacts: contacts || [],
      recentForms: (subs || []).map((s) => ({
        form_type: s.form_type,
        created_at: s.created_at,
        payloadKeys: Object.keys((s.payload as object) || {}),
        payloadPreview: JSON.stringify(s.payload).slice(0, 500),
      })),
    });
  }

  const { count: unknownContacts } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .ilike('first_name', 'unknown');

  const { count: friendPartners } = await supabase
    .from('chai_partners')
    .select('*', { count: 'exact', head: true })
    .eq('first_name', 'Friend');

  const { count: memberPartners } = await supabase
    .from('chai_partners')
    .select('*', { count: 'exact', head: true })
    .eq('first_name', 'Member');

  return NextResponse.json({
    unknownContacts: unknownContacts ?? 0,
    friendPartners: friendPartners ?? 0,
    memberPartners: memberPartners ?? 0,
    rows,
  });
}

/**
 * POST /api/admin/repair-chai-names
 * Fix Unknown/Friend Chai Partner + orphan Unknown Contact names.
 */
export async function POST() {
  const denied = await requireCapabilityApi('stripe_tools');
  if (denied) return denied;

  try {
    return NextResponse.json(await runRepair());
  } catch (err) {
    console.error('[repair-chai-names]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Repair failed' },
      { status: 500 },
    );
  }
}
