import { NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { buildEmailHtml, getFromEmail, sendEmail } from '@/lib/email/client';

export const dynamic = 'force-dynamic';

/** Everyone who got the false welcome email. */
const ALL_AFFECTED = [
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
  'tamir@noetic.io',
  'pessyr@gmail.com',
];

/**
 * One-shot apology for the false Chai Partner welcome emails.
 * POST /api/admin/send-zeffy-apology
 * Body: { confirm: true, only?: "email@..." | ["email@...", ...] }
 *
 * Bulk (no `only`) skips tamir/pessyr. Explicit `only` can include them.
 */
export async function POST(req: Request) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;

  let confirm = false;
  let onlyList: string[] = [];
  try {
    const body = (await req.json()) as { confirm?: boolean; only?: string | string[] };
    confirm = body.confirm === true;
    if (typeof body.only === 'string' && body.only.includes('@')) {
      onlyList = [body.only.trim().toLowerCase()];
    } else if (Array.isArray(body.only)) {
      onlyList = body.only
        .filter((e): e is string => typeof e === 'string' && e.includes('@'))
        .map((e) => e.trim().toLowerCase());
    }
  } catch {
    // ignore
  }
  if (!confirm) {
    return NextResponse.json({ error: 'Pass { confirm: true }.' }, { status: 400 });
  }

  const allowed = new Set(ALL_AFFECTED.map((e) => e.toLowerCase()));
  let targets: string[];

  if (onlyList.length > 0) {
    const invalid = onlyList.filter((e) => !allowed.has(e));
    if (invalid.length) {
      return NextResponse.json(
        { error: `Address(es) not on affected list: ${invalid.join(', ')}` },
        { status: 400 }
      );
    }
    targets = onlyList;
  } else {
    // Bulk: historical default — omit the two held back earlier
    targets = ALL_AFFECTED.filter(
      (e) => e !== 'tamir@noetic.io' && e !== 'pessyr@gmail.com'
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
    only: onlyList.length ? onlyList : null,
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
