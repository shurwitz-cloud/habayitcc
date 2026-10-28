import { NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { listEmailAudiences } from '@/lib/admin/email-audiences';

export const dynamic = 'force-dynamic';

/** GET /api/admin/email/audiences — recipient counts only; never sends mail. */
export async function GET() {
  const denied = await requireCapabilityApi('emails');
  if (denied) return denied;

  try {
    return NextResponse.json({ audiences: await listEmailAudiences() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load email groups.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
