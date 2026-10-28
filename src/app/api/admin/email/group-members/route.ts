import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import {
  clearEmailAudienceOverride,
  normalizeAudienceEmail,
  resolveEmailAudience,
  searchEmailAudienceContacts,
  setEmailAudienceOverride,
} from '@/lib/admin/email-audiences';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = await requireCapabilityApi('emails');
  if (denied) return denied;

  const audienceId = req.nextUrl.searchParams.get('audienceId')?.trim() ?? '';
  const query = req.nextUrl.searchParams.get('query')?.trim() ?? '';
  try {
    const audience = await resolveEmailAudience(audienceId);
    if (!audience) {
      return NextResponse.json({ error: 'CRM group not found.' }, { status: 404 });
    }
    const contacts = query ? await searchEmailAudienceContacts(query) : [];
    return NextResponse.json({ ...audience, contacts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load group contacts.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('emails');
  if (denied) return denied;

  let body: {
    audienceId?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    action?: 'include' | 'exclude';
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const audienceId = body.audienceId?.trim() ?? '';
  const email = normalizeAudienceEmail(body.email);
  const action = body.action;
  if (!audienceId || !email || (action !== 'include' && action !== 'exclude')) {
    return NextResponse.json(
      { error: 'Group, valid email address, and action are required.' },
      { status: 400 },
    );
  }

  try {
    await setEmailAudienceOverride({
      audienceId,
      email,
      firstName: body.firstName,
      lastName: body.lastName,
      action,
    });
    const audience = await resolveEmailAudience(audienceId);
    return NextResponse.json({ ok: true, audience });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not update group contact.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await requireCapabilityApi('emails');
  if (denied) return denied;

  let body: { audienceId?: string; email?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const audienceId = body.audienceId?.trim() ?? '';
  const email = normalizeAudienceEmail(body.email);
  if (!audienceId || !email) {
    return NextResponse.json(
      { error: 'Group and valid email address are required.' },
      { status: 400 },
    );
  }

  try {
    await clearEmailAudienceOverride({ audienceId, email });
    const audience = await resolveEmailAudience(audienceId);
    if (!audience) {
      return NextResponse.json({ error: 'CRM group not found.' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, audience });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not undo group override.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
