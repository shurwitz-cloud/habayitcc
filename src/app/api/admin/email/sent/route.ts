import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { listSentEmails } from '@/lib/resend/sent-mail';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/email/sent?limit=50&after=...
 * Read-only: lists emails sent via Resend (no outbound sends).
 */
export async function GET(req: NextRequest) {
  const denied = await requireCapabilityApi('emails');
  if (denied) return denied;

  const { searchParams } = req.nextUrl;
  const limit = searchParams.get('limit');
  const after = searchParams.get('after') ?? undefined;
  const before = searchParams.get('before') ?? undefined;

  const { data, error } = await listSentEmails({
    limit: limit ? Number(limit) : 50,
    after,
    before,
  });

  if (error) {
    return NextResponse.json({ error }, { status: 502 });
  }

  return NextResponse.json(data);
}
