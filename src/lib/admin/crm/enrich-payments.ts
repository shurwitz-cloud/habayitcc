import {
  coverageMonthsOf,
  inferPaymentMethodFromIntentId,
} from '@/lib/donations/payment-coverage';
import type { FormSubmission, Payment } from '@/types/database';

/**
 * Fill payment_method / coverage_months from columns, form_submissions, or intent id.
 */
export function enrichPaymentsForCrm(
  payments: Payment[],
  formSubmissions: FormSubmission[],
): Payment[] {
  const byIntent = new Map<string, FormSubmission>();
  for (const s of formSubmissions) {
    if (s.form_type !== 'chai_partner') continue;
    const payload = (s.payload || {}) as Record<string, unknown>;
    const key = String(payload.zeffyPaymentId || payload.paymentKey || '').trim();
    if (!key) continue;
    byIntent.set(key.startsWith('zeffy:') ? key : `zeffy:${key}`, s);
    byIntent.set(key, s);
  }

  return payments.map((p) => {
    const intent = p.stripe_payment_intent_id || '';
    const sub =
      byIntent.get(intent) ||
      byIntent.get(intent.replace(/^zeffy:/, '')) ||
      null;
    const payload = (sub?.payload || {}) as Record<string, unknown>;

    const method =
      (typeof p.payment_method === 'string' && p.payment_method.trim()) ||
      (typeof payload.paymentMethod === 'string' && payload.paymentMethod.trim()) ||
      inferPaymentMethodFromIntentId(intent) ||
      null;

    const coverageFromCol = Number(p.coverage_months);
    const coverageFromPayload = Number(payload.coverageMonths);
    const coverage =
      Number.isFinite(coverageFromCol) && coverageFromCol >= 1
        ? Math.floor(coverageFromCol)
        : Number.isFinite(coverageFromPayload) && coverageFromPayload >= 1
          ? Math.floor(coverageFromPayload)
          : payload.paidUpfront === true
            ? 12
            : coverageMonthsOf(p);

    return {
      ...p,
      payment_method: method,
      coverage_months: coverage,
    };
  });
}
