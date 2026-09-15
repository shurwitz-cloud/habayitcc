import { logFormSubmission } from '@/lib/admin/form-log';
import { sendLulavOrderEmails } from '@/lib/email/lulav-order';
import { appendLulavOrderRow } from '@/lib/google/sheets';
import type { LulavPayMethod, LulavPricing } from '@/lib/lulav/pricing';

export interface PersistLulavOrderInput {
  fullName: string;
  email: string;
  phone: string;
  payMethod: LulavPayMethod;
  coverFee: boolean;
  pricing: LulavPricing;
  status: 'paid' | 'pending_zelle';
  paymentId?: string | null;
  skipEmail?: boolean;
  skipSheet?: boolean;
}

export async function persistLulavOrder(
  input: PersistLulavOrderInput
): Promise<{ success: boolean; error?: string }> {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim().replace(/\s+/g, ' ');
  const phone = input.phone.trim();

  const payload = {
    fullName,
    email,
    phone,
    quantity: input.pricing.quantity,
    subtotal: input.pricing.subtotal,
    cardFee: input.pricing.cardFee,
    total: input.pricing.total,
    payMethod: input.payMethod,
    coverFee: input.coverFee,
    status: input.status,
    paymentId: input.paymentId ?? null,
  };

  const logged = await logFormSubmission({
    formType: 'lulav_order',
    email,
    payload,
  });

  if (!logged.ok) {
    return { success: false, error: 'Could not save your order. Please try again.' };
  }

  void logFormSubmission({
    formType: 'lulav_order',
    email,
    sourceId: logged.id,
    payload,
  });

  if (!input.skipSheet) {
    try {
      await appendLulavOrderRow({
        fullName,
        email,
        phone,
        quantity: input.pricing.quantity,
        subtotal: input.pricing.subtotal,
        coverFee: input.coverFee,
        cardFee: input.pricing.cardFee,
        total: input.pricing.total,
        payMethod: input.payMethod === 'card' ? 'Card' : 'Zelle',
        status: input.status === 'paid' ? 'Paid' : 'Pending Zelle',
        paymentId: input.paymentId ?? '',
      });
    } catch (err) {
      console.error('[lulav] sheet append failed:', err);
    }
  }

  if (!input.skipEmail) {
    await sendLulavOrderEmails({
      fullName,
      email,
      phone,
      payMethod: input.payMethod,
      pricing: input.pricing,
      status: input.status,
    });
  }

  return { success: true };
}
