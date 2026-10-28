import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type EntryKind = 'donation' | 'chai_partner';

/**
 * Hard-delete a CRM donation or Chai Partner (+ related payment ledger rows).
 * POST /api/admin/crm-delete-entry
 * Body: { confirm: true, kind: 'donation' | 'chai_partner', id: string }
 */
export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;

  let body: { confirm?: boolean; kind?: string; id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  if (body.confirm !== true) {
    return NextResponse.json({ error: 'Pass { confirm: true }.' }, { status: 400 });
  }

  const kind: EntryKind | null =
    body.kind === 'donation' || body.kind === 'chai_partner' ? body.kind : null;
  const id = (body.id ?? '').trim();

  if (!kind || !id) {
    return NextResponse.json(
      { error: 'kind and id are required.' },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const table = kind === 'donation' ? 'donations' : 'chai_partners';
  const sourceType = kind === 'donation' ? 'donation' : 'chai_partner';

  const { data: row, error: lookupError } = await supabase
    .from(table)
    .select('id, first_name, last_name, email')
    .eq('id', id)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
  }

  const { error: payError } = await supabase
    .from('payments')
    .delete()
    .eq('source_type', sourceType)
    .eq('source_id', id);

  if (payError) {
    return NextResponse.json(
      { error: `Failed to delete related payments: ${payError.message}` },
      { status: 500 },
    );
  }

  await supabase.from('form_submissions').delete().eq('source_id', id);

  const { error: delError } = await supabase.from(table).delete().eq('id', id);
  if (delError) {
    return NextResponse.json(
      { error: `Failed to delete entry: ${delError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    kind,
    id,
    name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
    email: row.email,
  });
}
