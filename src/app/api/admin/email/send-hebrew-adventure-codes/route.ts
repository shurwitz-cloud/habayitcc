import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import {
  buildEmailHtml,
  emailButton,
  getFromEmail,
  getResend,
  getSiteUrl,
} from '@/lib/email/client';
import { HEBREW_ADVENTURE_SLUG } from '@/lib/programs/names';
import { createAdminClient } from '@/lib/supabase/server';
import type { Child, Parent, ProgramRegistration } from '@/types/database';

export const dynamic = 'force-dynamic';

const FORM_TYPE = 'hebrew_adventure_event_code_email';
const SUBJECT = 'Save Your Hebrew Adventure Event Code';
const CONFIRMATION = 'SEND_HEBREW_ADVENTURE_CODES';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('emails');
  if (denied) return denied;

  let confirm = '';
  try {
    const body = (await req.json()) as { confirm?: string };
    confirm = body.confirm ?? '';
  } catch {
    // A missing confirmation remains a dry run.
  }

  const supabase = createAdminClient();
  const { data: program, error: programError } = await supabase
    .from('programs')
    .select('id')
    .eq('slug', HEBREW_ADVENTURE_SLUG)
    .maybeSingle();

  if (programError || !program?.id) {
    return NextResponse.json(
      { error: programError?.message ?? 'Hebrew Adventure program not found.' },
      { status: 500 },
    );
  }

  const { data: registrationRows, error: registrationError } = await supabase
    .from('program_registrations')
    .select('*')
    .eq('program_id', program.id)
    .in('status', ['accepted', 'active'])
    .not('fair_access_code', 'is', null);

  if (registrationError) {
    return NextResponse.json({ error: registrationError.message }, { status: 500 });
  }

  const registrations = (registrationRows ?? []) as ProgramRegistration[];
  const childIds = [...new Set(registrations.map((row) => row.child_id))];
  const familyIds = [...new Set(registrations.map((row) => row.family_id))];

  const [{ data: childRows }, { data: parentRows }, { data: sentRows }] = await Promise.all([
    childIds.length
      ? supabase.from('children').select('*').in('id', childIds)
      : Promise.resolve({ data: [] }),
    familyIds.length
      ? supabase.from('parents').select('*').in('family_id', familyIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from('form_submissions')
      .select('source_id')
      .eq('form_type', FORM_TYPE),
  ]);

  const children = new Map(
    ((childRows ?? []) as Child[]).map((child) => [child.id, child]),
  );
  const parentsByFamily = new Map<string, Parent[]>();
  for (const parent of (parentRows ?? []) as Parent[]) {
    const rows = parentsByFamily.get(parent.family_id) ?? [];
    rows.push(parent);
    parentsByFamily.set(parent.family_id, rows);
  }
  const alreadySent = new Set(
    (sentRows ?? []).map((row) => row.source_id).filter(Boolean),
  );

  const recipients = registrations.flatMap((registration) => {
    const child = children.get(registration.child_id);
    const parents = parentsByFamily.get(registration.family_id) ?? [];
    const parent =
      parents.find((item) => item.is_primary_contact && item.email) ??
      parents.find((item) => item.email);
    const code = registration.fair_access_code?.trim();

    if (!child || !parent?.email || !code || alreadySent.has(registration.id)) return [];

    return [{
      registrationId: registration.id,
      email: parent.email,
      parentFirstName: parent.first_name || 'there',
      childFirstName: child.first_name,
      code,
    }];
  });

  if (confirm !== CONFIRMATION) {
    return NextResponse.json({
      dryRun: true,
      eligible: recipients.length,
      alreadySent: alreadySent.size,
      recipients: recipients.map((row) => ({
        childFirstName: row.childFirstName,
        code: row.code,
        email: row.email,
      })),
      confirmationRequired: CONFIRMATION,
    });
  }

  if (!recipients.length) {
    return NextResponse.json({ ok: true, sent: 0, skipped: alreadySent.size });
  }

  const resend = getResend();
  if (!resend) {
    return NextResponse.json({ error: 'RESEND_API_KEY is not configured.' }, { status: 500 });
  }

  const registrationUrl =
    `${getSiteUrl()}/events/register/rosh-hashana-family-fair`;
  const emails = recipients.map((recipient) => ({
    from: `HaBayit Jewish Center <${getFromEmail()}>`,
    to: recipient.email,
    subject: SUBJECT,
    replyTo: getFromEmail(),
    html: buildEmailHtml(`
      <p>Hi ${escapeHtml(recipient.parentFirstName)},</p>
      <p>
        Save ${escapeHtml(recipient.childFirstName)}&rsquo;s HaBayit code for free or
        discounted entry to selected events throughout the year:
      </p>
      <p style="margin:20px 0;text-align:center;">
        <strong style="display:inline-block;padding:12px 20px;border:1px solid #b8902a;border-radius:8px;color:#172643;font-size:22px;letter-spacing:0.08em;">
          ${escapeHtml(recipient.code)}
        </strong>
      </p>
      <p>
        First up: <strong>Rosh Hashana Family Fair this Sunday, September 6</strong>
        &mdash; Hebrew Adventure kids attend free! Enter the code when registering.
      </p>
      ${emailButton(registrationUrl, 'Register for the Family Fair')}
      <p style="margin-top:20px;">The code can be used once per event.</p>
      <p>See you Sunday!<br>HaBayit</p>
    `),
  }));

  const { error: sendError } = await resend.batch.send(emails);
  if (sendError) {
    return NextResponse.json(
      { error: sendError.message || 'Resend batch failed.' },
      { status: 502 },
    );
  }

  const { error: auditError } = await supabase.from('form_submissions').insert(
    recipients.map((recipient) => ({
      form_type: FORM_TYPE,
      source_id: recipient.registrationId,
      email: recipient.email,
      payload: {
        subject: SUBJECT,
        child_first_name: recipient.childFirstName,
        fair_access_code: recipient.code,
        sent_at: new Date().toISOString(),
      },
    })),
  );

  if (auditError) {
    console.error('[hebrew-code-email] sent but audit insert failed:', auditError.message);
  }

  return NextResponse.json({
    ok: true,
    sent: recipients.length,
    skipped: alreadySent.size,
    auditLogged: !auditError,
  });
}
