import { logFormSubmission } from '@/lib/admin/form-log';
import { ensureCrmContact } from '@/lib/admin/ensure-contact';
import { createAdminClient, isServiceRoleConfigured } from '@/lib/supabase/server';

export interface RecordGoodsPaymentInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  itemLabel: string;
  quantity: number;
  unitAmount: number;
  /** Total received; should equal quantity x unitAmount. */
  amount: number;
  paymentMethod: string;
  memo?: string | null;
  /** Dedupe key (stored on goods_payments.payment_key and the ledger intent column). */
  paymentKey: string;
  paidAt?: string | null;
  includeInYearEnd: boolean;
  /**
   * Admin's explicit per-entry choice: also record this payment as a
   * donation (feeds the tax-donation receipt). Requires goodsFmv.
   * The goods row is always kept; the donation row links back to it.
   */
  includeAsDonation?: boolean;
  /** Good-faith FMV of what the payer received. Deductible = amount - goodsFmv. */
  goodsFmv?: number | null;
  /** Company / organization as payer of record. Receipts use this name when set. */
  company?: string | null;
  /** Existing contact explicitly picked as the payer; wins over email dedupe */
  contactId?: string | null;
}

export interface RecordGoodsPaymentResult {
  ok: boolean;
  duplicate?: boolean;
  goodsPaymentId?: string;
  error?: string;
}

/**
 * Record a non-donation goods/services/classes payment.
 * Writes goods_payments + a payments ledger row (source_type
 * 'goods_payment') and ensures a CRM contact. Never touches the
 * donations table: these payments are not tax-deductible gifts.
 */
export async function recordGoodsPayment(
  input: RecordGoodsPaymentInput,
): Promise<RecordGoodsPaymentResult> {
  if (!isServiceRoleConfigured()) {
    const message =
      'SUPABASE_SERVICE_ROLE_KEY is not configured on the server - payment was not saved to CRM.';
    console.error('[recordGoodsPayment]', message, input.paymentKey);
    return { ok: false, error: message };
  }

  const supabase = createAdminClient();
  const email = input.email.trim().toLowerCase();
  const paidAt = input.paidAt ?? new Date().toISOString();

  // One transaction: goods row + single ledger row + optional linked
  // donation row. A payment_key conflict comes back as duplicate, never
  // a second record. (Function lives in migration 0023.)
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    'record_goods_payment_tx',
    {
      p_first_name: input.firstName,
      p_last_name: input.lastName,
      p_email: email || null,
      p_phone: input.phone?.trim() ?? null,
      p_item_label: input.itemLabel,
      p_quantity: input.quantity,
      p_unit_amount: input.unitAmount,
      p_amount: input.amount,
      p_payment_method: input.paymentMethod,
      p_memo: input.memo?.trim() ?? null,
      p_payment_key: input.paymentKey,
      p_paid_at: paidAt,
      p_include_in_year_end: input.includeInYearEnd === true,
      p_include_as_donation: input.includeAsDonation === true,
      p_goods_fmv:
        input.includeAsDonation === true && input.goodsFmv != null
          ? Number(input.goodsFmv)
          : null,
      p_company: input.company?.trim() || null,
    },
  );

  if (rpcError) {
    console.error('[recordGoodsPayment] tx failed:', rpcError.message);
    return { ok: false, error: rpcError.message };
  }

  const result = rpcResult as {
    ok?: boolean;
    duplicate?: boolean;
    goods_payment_id?: string;
  } | null;
  if (!result?.ok) {
    return { ok: false, error: 'Save failed.' };
  }

  await logFormSubmission({
    formType: 'goods_payment',
    email,
    payload: { ...input, source: 'admin_manual_entry' },
  });

  if (!result.duplicate) {
    await ensureCrmContact({
      firstName: input.firstName,
      lastName: input.lastName,
      email,
      phone: input.phone,
      interest: 'Goods/Services',
      company: input.company,
      contactId: input.contactId ?? null,
      note: `--- Goods/Services payment ---\n${input.itemLabel.trim()}`,
      createdAt: input.paidAt,
      isResolved: true,
    });
  }

  return {
    ok: true,
    duplicate: result.duplicate === true,
    goodsPaymentId: result.goods_payment_id,
  };
}
