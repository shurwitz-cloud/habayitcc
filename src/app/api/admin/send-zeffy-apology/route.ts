import { NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { buildEmailHtml, getFromEmail, sendEmail } from '@/lib/email/client';

export const dynamic = 'force-dynamic';

const SKIP = new Set(['tamir@noetic.io', 'pessyr@gmail.com']);

const RECIPIENTS = [
  'jackshamah@gmail.com',
  'scdalmao@gmail.com',
  'chayale93@gmail.com',
  'devoraraitman@gmail.com',
  'slavyhur@gmail.com',
  'adrian@amgad.com',
  'yakovbren@gmail.com',
  'jordyn.tarazi@gmail.com',
  'gurshrenker@gmail.com',
  'etaitarazi@yahoo.com',
  'adir@adiry.com',
  'zev@renegadefurniture.com',
].filter((e) => !SKIP.has(e.toLowerCase()));

/**
 * One-shot apology for the false Chai Partner welcome emails.
 * POST /api/admin/send-zeffy-apology
 * Body: { confirm: true, only?: "email@example.com" }
 */
export async function POST(req: Request) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;

  let confirm = false;
  let only: string | undefined;
  try {
    const body = (await req.json()) as { confirm?: boolean; only?: string };
    confirm = body.confirm === true;
    if (typeof body.only === 'string' && body.only.includes('@')) {
      only = body.only.trim().toLowerCase();
    }
  } catch {
    // ignore
  }
  if (!confirm) {
    return NextResponse.json({ error: 'Pass { confirm: true }.' }, { status: 400 });
  }

  const targets = only
    ? RECIPIENTS.filter((e) => e.toLowerCase() === only)
    : RECIPIENTS;

  if (only && targets.length === 0) {
    return NextResponse.json(
      { error: `Address not in apology list (or was skipped): ${only}` },
      { status: 400 }
    );
  }

  const subject = 'Re: Thank you for becoming a HaBayit Chai Partner';
  const html = buildEmailHtml(`
    <p style="font-size:18px;color:#172643;font-weight:bold;margin:0 0 16px;">
      Please disregard our earlier email
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Dear friend,</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">
      We're writing to apologize for a confusing email you may have received earlier today from HaBayit.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">
      While connecting our Zeffy donation records with our new website systems, a technical glitch
      incorrectly treated some past one-time gifts as new monthly Chai Partner enrollments. That email
      was sent in error.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">
      <strong>Please disregard it entirely.</strong>
    </p>
    <ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.7;">
      <li>You were <strong>not</strong> enrolled as a monthly Chai Partner.</li>
      <li>You will <strong>not</strong> be charged monthly because of this.</li>
      <li>Nothing about your past gift has changed.</li>
    </ul>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">
      We're very sorry for the confusion and any concern this caused. If you have questions, just reply
      to this email — we're happy to help.
    </p>
    <p style="margin:0 0 4px;font-size:15px;line-height:1.7;">With appreciation,</p>
    <p style="margin:0;font-size:15px;line-height:1.7;color:#172643;font-weight:bold;">
      Rabbi Shmuly &amp; Devora<br>HaBayit Jewish Center
    </p>
  `);

  const from = getFromEmail();
  const results: Array<{ to: string; ok: boolean }> = [];

  for (const to of targets) {
    const ok = await sendEmail({
      to,
      subject,
      html,
      replyTo: from,
    });
    results.push({ to, ok });
  }

  return NextResponse.json({
    ok: true,
    subject,
    only: only ?? null,
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    skipped: [...SKIP],
    results,
  });
}
