import { NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { getSentEmail } from '@/lib/resend/sent-mail';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/email/sent/[id]
 * Read-only: retrieves a single sent email from Resend (no outbound sends).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireCapabilityApi('emails');
  if (denied) return denied;

  const { id } = await ctx.params;
  const { data, error } = await getSentEmail(id);

  if (error) {
    return NextResponse.json({ error }, { status: 502 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Email not found.' }, { status: 404 });
  }

  return NextResponse.json(data);
}
