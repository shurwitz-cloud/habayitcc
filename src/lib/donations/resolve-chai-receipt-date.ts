import { createAdminClient, isServiceRoleConfigured } from '@/lib/supabase/server';

/**
 * For late-entered Chai Partner gifts, emailed receipt links may still carry
 * "today" as the date. Prefer the CRM payment paid_at when we can match
 * name + amount on an active partner payment.
 */
export async function resolveChaiPartnerReceiptPaidAt(input: {
  name: string;
  amount: number;
  campaign?: string | null;
}): Promise<Date | null> {
  const campaign = (input.campaign || '').trim().toLowerCase();
  if (campaign !== 'chai-partner' && campaign !== 'habayit-chai-partner') {
    return null;
  }
  if (!isServiceRoleConfigured()) return null;
  if (!Number.isFinite(input.amount) || input.amount <= 0) return null;

  const parts = input.name.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (parts.length < 2) return null;
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');

  try {
    const supabase = createAdminClient();
    const { data: partners } = await supabase
      .from('chai_partners')
      .select('id, first_name, last_name, monthly_amount')
      .ilike('first_name', firstName)
      .ilike('last_name', lastName)
      .limit(5);

    if (!partners?.length) return null;

    for (const partner of partners) {
      const { data: payments } = await supabase
        .from('payments')
        .select('paid_at, amount')
        .eq('source_type', 'chai_partner')
        .eq('source_id', partner.id)
        .eq('status', 'succeeded')
        .order('paid_at', { ascending: true });

      const match = (payments || []).find(
        (p) => Math.abs(Number(p.amount) - input.amount) < 0.01 && p.paid_at,
      );
      if (match?.paid_at) {
        const d = new Date(match.paid_at);
        if (!Number.isNaN(d.getTime())) return d;
      }
    }
  } catch (err) {
    console.error('[receipt] chai paid_at lookup failed', err);
  }

  return null;
}
