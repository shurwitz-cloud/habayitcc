'use server';

import { stripe } from '@/lib/stripe/server';
import { assertSupabaseWriteReady } from '@/lib/supabase/require-write';
import { enforceActionRateLimit } from '@/lib/security/action-rate-limit';
import { computeLulavPricing, type LulavPayMethod } from '@/lib/lulav/pricing';
import { persistLulavOrder } from '@/lib/lulav/persist-order';

export interface LulavOrderInput {
  fullName: string;
  email: string;
  phone: string;
  quantity: number;
  payMethod: LulavPayMethod;
  coverFee: boolean;
  paymentIntentId?: string;
}

export async function submitLulavOrder(
  input: LulavOrderInput
): Promise<{ success: boolean; error?: string; status?: 'paid' | 'pending_zelle' }> {
  const limited = await enforceActionRateLimit('lulav-order', 12, 15 * 60 * 1000);
  if (!limited.ok) return { success: false, error: limited.error };

  const ready = assertSupabaseWriteReady();
  if (!ready.ok) return { success: false, error: ready.error };

  const fullName = input.fullName.trim().replace(/\s+/g, ' ');
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  const quantity = Math.floor(Number(input.quantity) || 0);
  const payMethod = input.payMethod;

  if (!fullName || !email || !phone) {
    return { success: false, error: 'Please fill in your name, email, and phone number.' };
  }
  if (quantity < 1 || quantity > 50) {
    return { success: false, error: 'Please order between 1 and 50 sets.' };
  }
  if (payMethod !== 'card' && payMethod !== 'zelle') {
    return { success: false, error: 'Please choose a payment method.' };
  }

  const coverFee = payMethod === 'card';
  const pricing = computeLulavPricing(quantity, payMethod, coverFee);

  if (payMethod === 'zelle') {
    const result = await persistLulavOrder({
      fullName,
      email,
      phone,
      payMethod: 'zelle',
      coverFee: false,
      pricing,
      status: 'pending_zelle',
    });
    if (!result.success) return result;
    return { success: true, status: 'pending_zelle' };
  }

  const paymentIntentId = input.paymentIntentId?.trim();
  if (!paymentIntentId) {
    return { success: false, error: 'Payment is incomplete. Please try again.' };
  }

  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== 'succeeded') {
      return { success: false, error: 'Payment was not completed. Please try again.' };
    }
    if (pi.metadata?.type !== 'lulav_order') {
      return { success: false, error: 'Payment verification failed.' };
    }
    if (pi.amount !== pricing.totalCents) {
      return { success: false, error: 'Payment amount does not match your order.' };
    }
    if ((pi.metadata.email ?? '').toLowerCase() !== email) {
      return { success: false, error: 'Payment email does not match.' };
    }

    const result = await persistLulavOrder({
      fullName,
      email,
      phone,
      payMethod: 'card',
      coverFee,
      pricing,
      status: 'paid',
      paymentId: pi.id,
    });
    if (!result.success) return result;
    return { success: true, status: 'paid' };
  } catch (err) {
    console.error('[lulav] submit error:', err);
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}
