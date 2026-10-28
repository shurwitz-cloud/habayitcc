import type {
  ParsedZeffyPayment,
  ZeffyCampaignLike,
  ZeffyContactLike,
  ZeffyPaymentLike,
  ZeffyWebhookEnvelope,
} from './types';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function pickNumber(...values: unknown[]): number | null {
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

function eventType(body: ZeffyWebhookEnvelope): string {
  return pickString(body.type, body.event).toLowerCase();
}

function extractPayment(body: ZeffyWebhookEnvelope): ZeffyPaymentLike | null {
  if (body.payment && typeof body.payment === 'object') return body.payment;
  if (body.data?.object && typeof body.data.object === 'object') return body.data.object;
  if (body.data?.payment && typeof body.data.payment === 'object') return body.data.payment;

  // Some senders POST the payment object directly.
  if (typeof body.id === 'string' && (body.amount != null || body.contact != null)) {
    return body as ZeffyPaymentLike;
  }
  return null;
}

function resolveContact(payment: ZeffyPaymentLike): ZeffyContactLike {
  const direct = payment.contact ?? payment.buyer ?? payment.donor;
  if (direct && typeof direct === 'object') return direct;
  return {};
}

function resolveCampaign(payment: ZeffyPaymentLike): ZeffyCampaignLike {
  const c = payment.campaign ?? payment.form;
  if (c && typeof c === 'object') return c;
  return {};
}

/**
 * Zeffy donation-form amounts are stored in cents (e.g. 15000 = $150).
 * Webhooks may send cents or dollars — detect cents when value is a whole number
 * and looks like minor units (>= 100 and not a clean "already dollars" chai tier).
 */
export function toAmountDollars(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  // Explicit cents: typical Zeffy form amounts (100 = $1.00, 15000 = $150).
  if (Number.isInteger(raw) && raw >= 100) {
    return Math.round(raw) / 100;
  }
  return Math.round(raw * 100) / 100;
}

export function parseZeffyWebhook(body: unknown): ParsedZeffyPayment | null {
  const envelope = asRecord(body) as ZeffyWebhookEnvelope | null;
  if (!envelope) return null;

  const type = eventType(envelope);
  if (type && !type.includes('payment') && type !== 'donation.completed') {
    // Still try to parse if a payment object is present.
  }

  const payment = extractPayment(envelope);
  if (!payment) return null;

  const paymentId = pickString(payment.id);
  if (!paymentId) return null;

  const status = pickString(payment.status, 'succeeded').toLowerCase();
  if (status && !['succeeded', 'completed', 'paid', 'success'].includes(status)) {
    return null;
  }

  const lineSum =
    Array.isArray(payment.line_items) && payment.line_items.length
      ? payment.line_items.reduce((sum, item) => {
          const a = pickNumber(item.amount) ?? 0;
          const q = pickNumber(item.quantity) ?? 1;
          return sum + a * q;
        }, 0)
      : null;

  const rawAmount = pickNumber(payment.amount, payment.amount_total, payment.total, lineSum);
  if (rawAmount == null || rawAmount <= 0) return null;

  const contact = resolveContact(payment);
  const campaign = resolveCampaign(payment);
  const address = asRecord(contact.address) ?? {};

  // Real Zeffy payloads nest email in several places.
  const email = pickString(
    contact.email,
    payment.email,
    (payment as { buyerEmail?: string }).buyerEmail,
    (asRecord(payment.buyer) ?? {}).email,
    (asRecord(payment.donor) ?? {}).email
  ).toLowerCase();
  if (!email) return null;

  let firstName = pickString(
    contact.first_name,
    contact.firstName,
    (payment as { first_name?: string }).first_name,
    (payment as { firstName?: string }).firstName,
  );
  let lastName = pickString(
    contact.last_name,
    contact.lastName,
    (payment as { last_name?: string }).last_name,
    (payment as { lastName?: string }).lastName,
  );
  const fullName = pickString(
    contact.name,
    (payment as { name?: string }).name,
    (payment as { full_name?: string }).full_name,
  );
  if ((!firstName || !lastName) && fullName) {
    const parts = String(fullName).trim().split(/\s+/);
    firstName = firstName || parts[0] || '';
    lastName = lastName || parts.slice(1).join(' ') || '';
  }
  // Never invent Friend/Partner placeholders — leave empty for repair later
  if (!firstName) firstName = '';
  if (!lastName) lastName = '';

  const campaignId =
    pickString(
      campaign.id,
      typeof payment.campaign === 'string' ? payment.campaign : '',
      (payment as { campaignId?: string }).campaignId,
      (payment as { formId?: string }).formId,
      (campaign as { urlPath?: string }).urlPath
    ) || null;

  const campaignTitle =
    pickString(campaign.title, campaign.name, (campaign as { urlPath?: string }).urlPath) || null;

  const isMonthly = detectMonthlyIntent(payment, campaignId, campaignTitle, body);

  return {
    paymentId,
    amountDollars: toAmountDollars(rawAmount),
    email,
    firstName,
    lastName,
    phone: pickString(contact.phone),
    street: pickString(address.line1, address.street),
    city: pickString(address.city),
    state: pickString(address.state),
    zip: pickString(address.postal_code, address.zip),
    campaignId,
    campaignTitle,
    isMonthly,
    status,
    raw: body,
  };
}

function detectMonthlyIntent(
  payment: ZeffyPaymentLike,
  campaignId: string | null,
  campaignTitle: string | null,
  body: unknown
): boolean {
  if (payment.is_recurring === true) return true;
  if (payment.recurring === true) return true;
  if (typeof payment.recurring === 'object' && payment.recurring) {
    const interval = String(payment.recurring.interval ?? '').toLowerCase();
    if (interval.includes('month')) return true;
  }
  const freq = pickString(payment.frequency, (payment as { interval?: string }).interval).toLowerCase();
  if (freq.includes('month') || freq === 'recurring' || freq === 'subscription') return true;

  // Habayit Chai Partner Zeffy form is monthly by product design.
  const formHaystack = `${campaignId ?? ''} ${campaignTitle ?? ''}`.toLowerCase();
  if (/habayit-chai-partner|\bchai partner\b|\bchai-partner\b/.test(formHaystack)) return true;

  const raw = JSON.stringify(body).toLowerCase();
  if (/"is_recurring"\s*:\s*true/.test(raw)) return true;
  if (/"frequency"\s*:\s*"[^"]*month/.test(raw)) return true;
  return false;
}

/** Only Habayit Chai Partner form — never treat other Zeffy gifts as monthly partners. */
export function isLikelyChaiPartnerPayment(parsed: ParsedZeffyPayment): boolean {
  const campaignFilter = process.env.ZEFFY_CHAI_CAMPAIGN_ID?.trim();
  if (campaignFilter) {
    return (
      parsed.campaignId === campaignFilter ||
      (parsed.campaignTitle ?? '').toLowerCase().includes(campaignFilter.toLowerCase())
    );
  }

  const haystack = `${parsed.campaignTitle ?? ''} ${parsed.campaignId ?? ''} ${JSON.stringify(parsed.raw)}`.toLowerCase();
  return /habayit-chai-partner|\bchai partner\b|\bchai-partner\b/.test(haystack);
}

/** Record in CRM as Chai Partner only when form matches + monthly + $150+. */
export function shouldRecordAsChaiPartner(parsed: ParsedZeffyPayment): boolean {
  return (
    isLikelyChaiPartnerPayment(parsed) &&
    parsed.isMonthly &&
    parsed.amountDollars >= 150
  );
}

/**
 * Auto welcome email: live webhook only, never imports.
 * Same gates as recording ($150+ monthly Chai form).
 */
export function shouldSendZeffyWelcomeEmail(
  parsed: ParsedZeffyPayment,
  source: 'webhook' | 'import'
): boolean {
  return source === 'webhook' && shouldRecordAsChaiPartner(parsed);
}
