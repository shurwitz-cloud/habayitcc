import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { syncPaidEventSheets } from '@/lib/events/paid-event-sheet';

export const dynamic = 'force-dynamic';

/**
 * Rewrite the shared events spreadsheet from CRM registrations.
 * POST /api/admin/sync-event-sheets  { confirm: true }
 */
export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;

  let confirm = false;
  try {
    const body = (await req.json()) as { confirm?: boolean };
    confirm = body.confirm === true;
  } catch {
    confirm = false;
  }
  if (!confirm) {
    return NextResponse.json({ error: 'Pass { confirm: true }.' }, { status: 400 });
  }

  const result = await syncPaidEventSheets();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
