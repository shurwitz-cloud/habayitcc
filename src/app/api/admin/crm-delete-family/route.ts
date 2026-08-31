import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Hard-delete a CRM family application and related rows
 * (registrations, children, parents, birthdays/important dates, tuition, waivers).
 *
 * POST /api/admin/crm-delete-family
 * Body: { confirm: true, familyId: string }
 */
export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('crm');
  if (denied) return denied;

  let body: { confirm?: boolean; familyId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  if (body.confirm !== true) {
    return NextResponse.json({ error: 'Pass { confirm: true }.' }, { status: 400 });
  }

  const familyId = (body.familyId ?? '').trim();
  if (!familyId) {
    return NextResponse.json({ error: 'familyId is required.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: family, error: lookupError } = await supabase
    .from('families')
    .select('id, family_name')
    .eq('id', familyId)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }
  if (!family) {
    return NextResponse.json({ error: 'Family not found.' }, { status: 404 });
  }

  const { data: children } = await supabase
    .from('children')
    .select('id')
    .eq('family_id', familyId);
  const childIds = (children ?? []).map((c) => c.id);

  const steps: string[] = [];

  // Birthdays / important dates (family + children)
  {
    const { error } = await supabase
      .from('important_dates')
      .delete()
      .eq('family_id', familyId);
    if (error) {
      return NextResponse.json(
        { error: `important_dates (family): ${error.message}`, steps },
        { status: 500 },
      );
    }
    steps.push('important_dates:family');
  }
  if (childIds.length) {
    const { error } = await supabase
      .from('important_dates')
      .delete()
      .in('child_id', childIds);
    if (error) {
      return NextResponse.json(
        { error: `important_dates (children): ${error.message}`, steps },
        { status: 500 },
      );
    }
    steps.push('important_dates:children');
  }

  // Tuition + payments linked to program registrations
  {
    const { data: regs } = await supabase
      .from('program_registrations')
      .select('id')
      .eq('family_id', familyId);
    const regIds = (regs ?? []).map((r) => r.id);
    if (regIds.length) {
      await supabase
        .from('payments')
        .delete()
        .eq('source_type', 'program_registration')
        .in('source_id', regIds);
      steps.push('payments:program_registration');
    }
  }

  await supabase.from('tuition_installments').delete().eq('family_id', familyId);
  steps.push('tuition_installments');

  await supabase.from('waivers').delete().eq('family_id', familyId);
  steps.push('waivers');

  {
    const { error } = await supabase
      .from('program_registrations')
      .delete()
      .eq('family_id', familyId);
    if (error) {
      return NextResponse.json(
        { error: `program_registrations: ${error.message}`, steps },
        { status: 500 },
      );
    }
    steps.push('program_registrations');
  }

  {
    const { error } = await supabase.from('children').delete().eq('family_id', familyId);
    if (error) {
      return NextResponse.json({ error: `children: ${error.message}`, steps }, { status: 500 });
    }
    steps.push('children');
  }

  {
    const { error } = await supabase.from('parents').delete().eq('family_id', familyId);
    if (error) {
      return NextResponse.json({ error: `parents: ${error.message}`, steps }, { status: 500 });
    }
    steps.push('parents');
  }

  await supabase.from('form_submissions').delete().eq('source_id', familyId);

  {
    const { error } = await supabase.from('families').delete().eq('id', familyId);
    if (error) {
      return NextResponse.json({ error: `families: ${error.message}`, steps }, { status: 500 });
    }
    steps.push('families');
  }

  return NextResponse.json({
    ok: true,
    familyId,
    familyName: family.family_name,
    steps,
  });
}
