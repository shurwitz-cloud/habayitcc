/**
 * Recover one or more paid-event people into CRM (one row each) + confirmation + apology.
 *
 *   npx vercel env run -e production -- node scripts/recover-paid-event-people.mjs \
 *     adi_sagie@hotmail.com rebecca.greenberg3@gmail.com
 */
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { Resend } from 'resend';

const EVENT_SLUG = 'pre-rosh-hashana-womens';
const EVENT_TITLE = 'The Art of Kintsugi — For Women';
const EVENT_DATE = 'Tuesday, September 1st';
const EVENT_TIME = '7:45 PM';
const DRY_RUN = process.argv.includes('--dry-run');

const emails = process.argv
  .slice(2)
  .filter((a) => a.includes('@'))
  .map((e) => e.trim().toLowerCase());

if (!emails.length) {
  console.error('Usage: node scripts/recover-paid-event-people.mjs email1 [email2...]');
  process.exit(1);
}

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v || v.includes('SENSITIVE')) {
    console.error(`Missing usable ${name}`);
    process.exit(1);
  }
  return v;
}

const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'));
const supabase = createClient(
  requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } },
);
const resendKey = process.env.RESEND_API_KEY?.trim();
const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || 'info@habayitcc.org';
const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL?.trim() || fromEmail;

const since = Math.floor(Date.now() / 1000) - 21 * 24 * 60 * 60;
const list = await stripe.paymentIntents.list({ limit: 100, created: { gte: since } });

async function insertWithFallback(payload) {
  let current = { ...payload };
  for (let i = 0; i < 8; i++) {
    const { data, error } = await supabase
      .from('event_registrations')
      .insert(current)
      .select('id')
      .single();
    if (!error && data) return { data, error: null };
    const msg = error?.message || '';
    const m =
      msg.match(/Could not find the '([^']+)' column/i) ||
      msg.match(/column "([^"]+)" of relation/i) ||
      msg.match(/column ([^\s]+) does not exist/i);
    if (!m?.[1] || !(m[1] in current)) return { data: null, error };
    console.warn('Retry without column', m[1]);
    delete current[m[1]];
  }
  return { data: null, error: { message: 'too many retries' } };
}

function shellHtml(content) {
  return `<!DOCTYPE html><html><body style="margin:0;background:#f7f3ea;font-family:Helvetica,Arial,sans-serif;color:#282828;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;"><tr><td align="center">
  <table width="100%" style="max-width:560px;background:#fff;border:1px solid #e4ded2;border-radius:12px;">
  <tr><td style="background:#172643;padding:16px 20px;color:#b8902a;font-size:14px;">HaBayit Israeli Jewish Center</td></tr>
  <tr><td style="padding:28px;">${content}</td></tr>
  <tr><td style="padding:16px 28px 24px;border-top:1px solid #e4ded2;text-align:center;font-size:12px;color:#6f6a60;">
  HaBayit · Cooper City, FL · info@habayitcc.org · (646) 462-1138
  </td></tr></table></td></tr></table></body></html>`;
}

async function sendEmails({ firstName, email, total, ticketSubtotal, cardFee, extras }) {
  if (!resendKey) {
    console.warn('No RESEND_API_KEY — emails skipped');
    return;
  }
  const resend = new Resend(resendKey);
  const from = `HaBayit Jewish Center <${fromEmail}>`;

  const confirmHtml = shellHtml(`
    <p>Dear ${firstName},</p>
    <p>You're registered for <strong>${EVENT_TITLE}</strong>. We look forward to seeing you!</p>
    <p>Date: ${EVENT_DATE} · ${EVENT_TIME}<br>Women attending: 1</p>
    <p>Tickets: $${ticketSubtotal.toFixed(2)}<br>
    ${cardFee > 0 ? `Card processing: $${cardFee.toFixed(2)}<br>` : ''}
    <strong>Total: $${total.toFixed(2)}</strong></p>
  `);

  const apologyHtml = shellHtml(`
    <p>Dear ${firstName},</p>
    <p>Thank you for registering for <strong>${EVENT_TITLE}</strong> — we are so glad you will be with us.</p>
    <p>We want to apologize for a brief technical glitch during checkout. Your registration is confirmed, but your card may have been charged more than once for the same RSVP.</p>
    <p>Please don’t worry: <strong>you only need one registration</strong>, and we will refund the extra charge(s) so you are only charged once ($${ticketSubtotal.toFixed(2)} for your ticket). You don’t need to do anything on your end.</p>
    <p>We’re looking forward to seeing you on ${EVENT_DATE} at ${EVENT_TIME}. If you have any questions, just reply to this email.</p>
    <p>With warmth,<br><strong>HaBayit Israeli Jewish Center</strong><br>
    <a href="mailto:info@habayitcc.org">info@habayitcc.org</a></p>
  `);

  const c = await resend.emails.send({
    from,
    to: email,
    subject: `Registration confirmed — ${EVENT_TITLE}`,
    html: confirmHtml,
    reply_to: 'info@habayitcc.org',
  });
  console.log('Confirmation email:', c.error ? c.error : 'ok');

  if (extras.length > 0) {
    const a = await resend.emails.send({
      from,
      to: email,
      subject: `You're registered — and a quick note about your payment (${EVENT_TITLE})`,
      html: apologyHtml,
      reply_to: 'info@habayitcc.org',
    });
    console.log('Apology email:', a.error ? a.error : 'ok');
  }

  await resend.emails.send({
    from,
    to: adminEmail,
    subject: `Recovered registration — ${EVENT_TITLE} (${firstName})`,
    html: shellHtml(
      `<p>Recovered <strong>${firstName}</strong> (${email}) into CRM.</p>
       <p>Total logged: $${total.toFixed(2)}<br>Extras to refund: ${extras.join(', ') || 'none'}</p>`,
    ),
  });
}

const { data: eventRow } = await supabase.from('events').select('id').eq('slug', EVENT_SLUG).maybeSingle();
let eventId = eventRow?.id;
if (!eventId) {
  const { data: inserted, error } = await supabase
    .from('events')
    .insert({
      slug: EVENT_SLUG,
      title: EVENT_TITLE,
      description: 'Kintsugi for women',
      starts_at: '2026-09-01T19:45:00-04:00',
      location: 'HaBayit Jewish Center',
      is_published: true,
    })
    .select('id')
    .single();
  if (error || !inserted) {
    console.error('Could not ensure event', error);
    process.exit(1);
  }
  eventId = inserted.id;
}

for (const EMAIL of emails) {
  const matched = list.data
    .filter((pi) => {
      if (pi.status !== 'succeeded') return false;
      const meta = pi.metadata ?? {};
      if (meta.type !== 'paid_event_registration') return false;
      if ((meta.event_slug || '') !== EVENT_SLUG) return false;
      return (meta.donor_email || '').trim().toLowerCase() === EMAIL;
    })
    .sort((a, b) => b.created - a.created);

  console.log(`\n=== ${EMAIL}: ${matched.length} succeeded charge(s) ===`);
  for (const pi of matched) {
    console.log(`  ${pi.id} $${(pi.amount / 100).toFixed(2)}`);
  }
  if (!matched.length) {
    console.warn('No charges found — skip');
    continue;
  }

  const primary = matched[0];
  const meta = primary.metadata ?? {};
  const donorName = (meta.donor_name || EMAIL.split('@')[0]).trim();
  const parts = donorName.split(/\s+/);
  const firstName = meta.first_name?.trim() || parts[0] || 'Friend';
  const lastName =
    meta.last_name?.trim() ||
    parts.slice(1).join(' ') ||
    (EMAIL.includes('greenberg') ? 'Greenberg' : EMAIL.includes('sagie') ? 'Sagie' : '');
  const phone = (meta.phone || '').trim();
  const women = Math.max(1, Number(meta.women || 1) || 1);
  const sponsorAmount = Number(meta.sponsor_amount || 0) || 0;
  const total = primary.amount / 100;
  const ticketSubtotal = Number(meta.ticket_subtotal || 36) || 36;
  const cardFee =
    Number(meta.card_fee || 0) || Math.max(0, +(total - ticketSubtotal - sponsorAmount).toFixed(2));
  const coverFee = cardFee > 0;
  const allPiIds = matched.map((p) => p.id);
  const extras = allPiIds.slice(1);

  let existingId = null;
  for (const pi of matched) {
    const { data } = await supabase
      .from('event_registrations')
      .select('id')
      .eq('stripe_payment_intent_id', pi.id)
      .maybeSingle();
    if (data?.id) {
      existingId = data.id;
      break;
    }
  }
  if (!existingId) {
    const { data: byEmail } = await supabase
      .from('event_registrations')
      .select('id')
      .eq('event_slug', EVENT_SLUG)
      .ilike('email', EMAIL)
      .limit(1)
      .maybeSingle();
    if (byEmail?.id) existingId = byEmail.id;
  }

  if (existingId) {
    console.log('Already in CRM:', existingId);
    if (!DRY_RUN && extras.length) {
      await sendEmails({ firstName, email: EMAIL, total, ticketSubtotal, cardFee, extras });
    }
    continue;
  }

  const notes = [
    `Women attending: ${women}`,
    `Stripe payment: ${primary.id}`,
    extras.length
      ? `Duplicate Stripe charges (refund extras in Stripe):\n${allPiIds.map((id) => `- ${id}`).join('\n')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  console.log(DRY_RUN ? 'DRY RUN would insert' : 'Inserting', {
    name: `${firstName} ${lastName}`,
    total,
    primary: primary.id,
    extras,
  });
  if (DRY_RUN) continue;

  const { data: reg, error: regErr } = await insertWithFallback({
    event_id: eventId,
    event_slug: EVENT_SLUG,
    first_name: firstName,
    last_name: lastName,
    email: EMAIL,
    phone: phone || null,
    guest_count: women,
    notes,
    amount: total,
    sponsor_amount: sponsorAmount,
    card_fee: cardFee,
    stripe_payment_intent_id: primary.id,
    registration_details: {
      type: 'womens',
      womens: { women },
      ticketSubtotal,
      coverFee,
    },
  });

  if (regErr || !reg) {
    console.error('Insert failed', regErr);
    continue;
  }
  console.log('CRM id:', reg.id);

  await supabase.from('form_submissions').insert({
    form_type: 'rsvp',
    email: EMAIL,
    source_id: reg.id,
    payload: {
      slug: EVENT_SLUG,
      eventTitle: EVENT_TITLE,
      firstName,
      lastName,
      email: EMAIL,
      phone,
      paymentIntentId: primary.id,
      womens: { women },
      pricing: { ticketSubtotal, sponsorAmount, cardFee, total },
      recovered: true,
      duplicatePaymentIntents: extras,
    },
  });

  await supabase.from('contacts').insert({
    first_name: firstName,
    last_name: lastName,
    email: EMAIL,
    phone: phone || null,
    interest: EVENT_TITLE,
    message: `--- ${EVENT_TITLE} ---\nWomen attending: ${women}\nTotal: $${total.toFixed(2)}\nRecovered from Stripe ${primary.id}`,
    is_resolved: true,
  });

  await sendEmails({ firstName, email: EMAIL, total, ticketSubtotal, cardFee, extras });
}

console.log('\nDone.');
