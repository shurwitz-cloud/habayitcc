/**
 * One-shot: recover Adi Sagie Kintsugi registration into CRM (one row, one email).
 * Run with production env injected (does not write secrets to disk):
 *
 *   npx vercel env run -e production -- node scripts/recover-adi-sagie.mjs
 */
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const EMAIL = 'adi_sagie@hotmail.com';
const EVENT_SLUG = 'pre-rosh-hashana-womens';
const DRY_RUN = process.argv.includes('--dry-run');
const SEND_EMAIL = !process.argv.includes('--no-email');

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing ${name}`);
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

const since = Math.floor(Date.now() / 1000) - 14 * 24 * 60 * 60;

const list = await stripe.paymentIntents.list({
  limit: 100,
  created: { gte: since },
});

const matched = list.data
  .filter((pi) => {
    if (pi.status !== 'succeeded') return false;
    const meta = pi.metadata ?? {};
    if (meta.type !== 'paid_event_registration') return false;
    if ((meta.event_slug || '') !== EVENT_SLUG) return false;
    const email = (meta.donor_email || '').trim().toLowerCase();
    return email === EMAIL;
  })
  .sort((a, b) => b.created - a.created);

console.log(`Found ${matched.length} succeeded PaymentIntent(s) for ${EMAIL}`);
for (const pi of matched) {
  console.log(`  ${pi.id}  $${(pi.amount / 100).toFixed(2)}  ${new Date(pi.created * 1000).toISOString()}`);
}

if (!matched.length) {
  console.error('No matching charges found.');
  process.exit(2);
}

const primary = matched[0];
const meta = primary.metadata ?? {};
const donorName = (meta.donor_name || 'Adi Sagie').trim();
const parts = donorName.split(/\s+/);
const firstName = meta.first_name?.trim() || parts[0] || 'Adi';
const lastName = meta.last_name?.trim() || parts.slice(1).join(' ') || 'Sagie';
const phone = (meta.phone || '').trim();
const women = Math.max(1, Number(meta.women || 1) || 1);
const sponsorAmount = Number(meta.sponsor_amount || 0) || 0;
const coverFee = Number(meta.card_fee || 0) > 0 || meta.cover_fee === '1';
const total = primary.amount / 100;
const ticketSubtotal = Number(meta.ticket_subtotal || 36) || 36;
const cardFee = Number(meta.card_fee || 0) || Math.max(0, total - ticketSubtotal - sponsorAmount);

// Already registered?
for (const pi of matched) {
  const { data } = await supabase
    .from('event_registrations')
    .select('id')
    .eq('stripe_payment_intent_id', pi.id)
    .maybeSingle();
  if (data?.id) {
    console.log(`Already registered via ${pi.id} → ${data.id}`);
    process.exit(0);
  }
}

const { data: byEmail } = await supabase
  .from('event_registrations')
  .select('id')
  .eq('event_slug', EVENT_SLUG)
  .ilike('email', EMAIL)
  .limit(1)
  .maybeSingle();

if (byEmail?.id) {
  console.log(`Already registered by email → ${byEmail.id}`);
  process.exit(0);
}

const { data: eventRow } = await supabase
  .from('events')
  .select('id')
  .eq('slug', EVENT_SLUG)
  .maybeSingle();

let eventId = eventRow?.id;
if (!eventId) {
  const { data: inserted, error } = await supabase
    .from('events')
    .insert({
      slug: EVENT_SLUG,
      title: 'The Art of Kintsugi — For Women',
      description:
        'Discover the ancient Japanese art of Kintsugi — repairing broken pottery with gold.',
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

const allPiIds = matched.map((p) => p.id);
const notes = [
  `Women attending: ${women}`,
  '',
  `Stripe payment: ${primary.id}`,
  matched.length > 1
    ? `Duplicate Stripe charges (refund extras in Stripe):\n${allPiIds.map((id) => `- ${id}`).join('\n')}`
    : null,
]
  .filter(Boolean)
  .join('\n');

const row = {
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
};

console.log(DRY_RUN ? 'DRY RUN — would insert:' : 'Inserting:', {
  name: `${firstName} ${lastName}`,
  email: EMAIL,
  amount: total,
  primaryPi: primary.id,
  extras: allPiIds.slice(1),
  sendEmail: SEND_EMAIL && !DRY_RUN,
});

if (DRY_RUN) process.exit(0);

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

const { data: reg, error: regErr } = await insertWithFallback(row);
if (regErr || !reg) {
  console.error('Insert failed', regErr);
  process.exit(1);
}

console.log('CRM registration id:', reg.id);

await supabase.from('form_submissions').insert({
  form_type: 'rsvp',
  email: EMAIL,
  source_id: reg.id,
  payload: {
    slug: EVENT_SLUG,
    eventTitle: 'The Art of Kintsugi — For Women',
    firstName,
    lastName,
    email: EMAIL,
    phone,
    coverFee,
    sponsorAmount,
    paymentIntentId: primary.id,
    womens: { women },
    pricing: {
      ticketSubtotal,
      sponsorAmount,
      cardFee,
      total,
    },
    recovered: true,
    duplicatePaymentIntents: allPiIds.slice(1),
  },
});

await supabase.from('contacts').insert({
  first_name: firstName,
  last_name: lastName,
  email: EMAIL,
  phone: phone || null,
  interest: 'The Art of Kintsugi — For Women',
  message: `--- The Art of Kintsugi — For Women ---\nWomen attending: ${women}\nTotal: $${total.toFixed(2)}\nRecovered from Stripe ${primary.id}`,
  is_resolved: true,
});

if (SEND_EMAIL) {
  // Call production email via Resend if configured in this env.
  const { Resend } = await import('resend');
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim() || 'HaBayit <info@habayitcc.org>';
  if (!resendKey) {
    console.warn('RESEND_API_KEY missing — registration saved but email not sent.');
  } else {
    const resend = new Resend(resendKey);
    const admin = process.env.ADMIN_EMAIL?.trim() || 'info@habayitcc.org';
    const subject = `Registration confirmed — The Art of Kintsugi — For Women`;
    const html = `
      <p>Dear ${firstName},</p>
      <p>You're registered for <strong>The Art of Kintsugi — For Women</strong>. We look forward to seeing you!</p>
      <p>Date: Tuesday, September 1st · 7:45 PM<br>Women attending: ${women}</p>
      <p>Tickets: $${ticketSubtotal.toFixed(2)}<br>
      ${cardFee > 0 ? `Card processing: $${cardFee.toFixed(2)}<br>` : ''}
      <strong>Total: $${total.toFixed(2)}</strong></p>
      <p>If you were charged more than once, please contact us — we will help with refunds.</p>
    `;
    const attendee = await resend.emails.send({
      from,
      to: EMAIL,
      subject,
      html,
    });
    await resend.emails.send({
      from,
      to: admin,
      subject: `New registration — The Art of Kintsugi — For Women (${firstName} ${lastName}) [recovered]`,
      html: `<p><strong>${firstName} ${lastName}</strong> recovered into CRM for Kintsugi.</p>
        <p>Email: ${EMAIL}<br>Phone: ${phone || '—'}<br>Total: $${total.toFixed(2)}<br>PI: ${primary.id}<br>Extras to refund: ${allPiIds.slice(1).join(', ') || 'none'}</p>`,
    });
    console.log('Confirmation email sent:', attendee.error ? attendee.error : 'ok');
  }
}

console.log('Done. Refund extras in Stripe:', allPiIds.slice(1));
