import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { draftAdminEmail } from '@/lib/email/draft-with-ai';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/email/draft
 * AI-assisted subject + body for admin compose. Does not send mail.
 */
export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('emails');
  if (denied) return denied;

  let body: {
    prompt?: string;
    tone?: 'warm' | 'brief' | 'formal';
    recipientHint?: string;
    audienceHint?: string;
    existingSubject?: string;
    existingMessage?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const result = await draftAdminEmail({
    prompt: body.prompt ?? '',
    tone: body.tone,
    recipientHint: body.recipientHint,
    audienceHint: body.audienceHint,
    existingSubject: body.existingSubject,
    existingMessage: body.existingMessage,
  });

  if (!result.ok) {
    const status = result.error.includes('OPENAI_API_KEY') ? 503 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    subject: result.subject,
    message: result.message,
  });
}
