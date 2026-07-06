'use server';

import { revalidatePath } from 'next/cache';
import { isAdminAuthenticated } from '@/lib/admin/auth';
import { sendRegistrationAcceptedEmail } from '@/lib/email/registration-accepted';
import {
  formatUsd,
  getFamilyTuitionBilling,
  resolvePaymentMethod,
  stripeCustomerUrl,
} from '@/lib/programs/hebrew-adventure-billing';
import { HEBREW_ADVENTURE_SLUG } from '@/lib/programs/names';
import {
  chargeSavedTuitionPayment,
  paymentIntentIsPaidOrPending,
} from '@/lib/stripe/charge-tuition';
import { createAdminClient } from '@/lib/supabase/server';

export type PendingFamilyRegistration = {
  familyId: string;
  familyName: string;
  parentName: string;
  parentEmail: string;
  stripeCustomerId: string | null;
  stripePaymentMethodId: string | null;
  paymentMethod: 'card' | 'bank';
  paymentPlan: string;
  term: string | null;
  tuitionSubtotal: number;
  grandTotal: number;
  firstInstallment: number;
  installmentCount: number;
  children: Array<{ name: string; grade: string | null; tuition: number }>;
  createdAt: string;
  stripeCustomerUrl: string | null;
};

export type ScheduledInstallment = {
  id: string;
  familyId: string;
  familyName: string;
  parentEmail: string;
  installmentNumber: number;
  amount: number;
  dueDate: string;
  status: string;
  stripeCustomerUrl: string | null;
};

async function requireAdmin() {
  if (!(await isAdminAuthenticated())) {
    throw new Error('Unauthorized');
  }
}

export async function getPendingRegistrations(): Promise<PendingFamilyRegistration[]> {
  await requireAdmin();
  const supabase = createAdminClient();

  const { data: program } = await supabase
    .from('programs')
    .select('id')
    .eq('slug', HEBREW_ADVENTURE_SLUG)
    .single();

  if (!program) return [];

  const { data: rows } = await supabase
    .from('program_registrations')
    .select(
      `
      id, family_id, payment_plan, tuition_total, term, notes, created_at,
      families (
        family_name, stripe_customer_id, stripe_payment_method_id, payment_method_preference
      ),
      children ( first_name, last_name, grade )
    `
    )
    .eq('program_id', program.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (!rows?.length) return [];

  const familyIds = [...new Set(rows.map((r) => r.family_id))];
  const { data: parents } = await supabase
    .from('parents')
    .select('family_id, first_name, last_name, email, is_primary_contact')
    .in('family_id', familyIds);

  type ParentRow = {
    family_id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    is_primary_contact: boolean;
  };

  const parentByFamily = new Map<string, ParentRow>();
  for (const p of (parents ?? []) as ParentRow[]) {
    const existing = parentByFamily.get(p.family_id);
    if (!existing || p.is_primary_contact) {
      parentByFamily.set(p.family_id, p);
    }
  }

  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = grouped.get(row.family_id) ?? [];
    list.push(row);
    grouped.set(row.family_id, list);
  }

  const results: PendingFamilyRegistration[] = [];

  type FamilyJoin = {
    family_name: string;
    stripe_customer_id: string | null;
    stripe_payment_method_id: string | null;
    payment_method_preference: string | null;
  };

  function unwrapFamily(raw: unknown): FamilyJoin | null {
    if (!raw) return null;
    if (Array.isArray(raw)) return (raw[0] as FamilyJoin) ?? null;
    return raw as FamilyJoin;
  }

  for (const [familyId, regs] of grouped) {
    const family = unwrapFamily(regs[0].families);

    const parent = parentByFamily.get(familyId);
    const paymentPlan = regs[0].payment_plan ?? 'full';
    const term = regs[0].term;
    const paymentMethod = resolvePaymentMethod(
      family?.payment_method_preference,
      regs[0].notes
    );
    const tuitionSubtotal = regs.reduce((sum, r) => sum + Number(r.tuition_total ?? 0), 0);
    const billing = getFamilyTuitionBilling({
      tuitionSubtotal,
      paymentPlan: paymentPlan as 'full' | 'two_installments' | 'three_installments',
      paymentMethod,
      term,
    });

    results.push({
      familyId,
      familyName: family?.family_name ?? 'Family',
      parentName: parent ? `${parent.first_name} ${parent.last_name}` : '—',
      parentEmail: parent?.email ?? '',
      stripeCustomerId: family?.stripe_customer_id ?? null,
      stripePaymentMethodId: family?.stripe_payment_method_id ?? null,
      paymentMethod,
      paymentPlan,
      term,
      tuitionSubtotal,
      grandTotal: billing.grandTotal,
      firstInstallment: billing.installments[0]?.amount ?? 0,
      installmentCount: billing.installments.length,
      children: regs.map((r) => {
        const childRaw = r.children as
          | { first_name: string; last_name: string; grade: string | null }
          | { first_name: string; last_name: string; grade: string | null }[];
        const child = Array.isArray(childRaw) ? childRaw[0] : childRaw;
        return {
          name: `${child.first_name} ${child.last_name}`,
          grade: child.grade,
          tuition: Number(r.tuition_total ?? 0),
        };
      }),
      createdAt: regs[0].created_at,
      stripeCustomerUrl: family?.stripe_customer_id
        ? stripeCustomerUrl(family.stripe_customer_id)
        : null,
    });
  }

  return results.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function getScheduledInstallments(): Promise<ScheduledInstallment[]> {
  await requireAdmin();
  const supabase = createAdminClient();

  const { data: rows } = await supabase
    .from('tuition_installments')
    .select(
      `
      id, family_id, installment_number, amount, due_date, status,
      families ( family_name, stripe_customer_id )
    `
    )
    .in('status', ['scheduled', 'processing', 'failed'])
    .order('due_date', { ascending: true });

  if (!rows?.length) return [];

  const familyIds = rows.map((r) => r.family_id);
  const { data: parents } = await supabase
    .from('parents')
    .select('family_id, email, is_primary_contact')
    .in('family_id', familyIds);

  const emailByFamily = new Map<string, string>();
  for (const p of parents ?? []) {
    if (p.is_primary_contact || !emailByFamily.has(p.family_id)) {
      if (p.email) emailByFamily.set(p.family_id, p.email);
    }
  }

  return rows.map((row) => {
    const familyRaw = row.families;
    const family = Array.isArray(familyRaw) ? familyRaw[0] : familyRaw;
    const fam = family as { family_name: string; stripe_customer_id: string | null } | null;
    return {
      id: row.id,
      familyId: row.family_id,
      familyName: fam?.family_name ?? 'Family',
      parentEmail: emailByFamily.get(row.family_id) ?? '',
      installmentNumber: row.installment_number,
      amount: Number(row.amount),
      dueDate: row.due_date,
      status: row.status,
      stripeCustomerUrl: fam?.stripe_customer_id
        ? stripeCustomerUrl(fam.stripe_customer_id)
        : null,
    };
  });
}

export async function acceptAndChargeFamily(
  familyId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  await requireAdmin();

  try {
    const supabase = createAdminClient();

    const { data: family } = await supabase
      .from('families')
      .select('*')
      .eq('id', familyId)
      .single();

    if (!family?.stripe_customer_id || !family.stripe_payment_method_id) {
      return {
        success: false,
        error: 'No saved Stripe payment method. Parent must re-register or add in Stripe Dashboard.',
      };
    }

    const { data: program } = await supabase
      .from('programs')
      .select('id')
      .eq('slug', HEBREW_ADVENTURE_SLUG)
      .single();

    if (!program?.id) {
      return { success: false, error: 'Hebrew Adventure program not found.' };
    }

    const { data: regs } = await supabase
      .from('program_registrations')
      .select('id, payment_plan, tuition_total, term, notes, status')
      .eq('family_id', familyId)
      .eq('program_id', program.id)
      .eq('status', 'pending');

    if (!regs?.length) {
      return { success: false, error: 'No pending registrations for this family.' };
    }

    const { data: parent } = await supabase
      .from('parents')
      .select('first_name, email')
      .eq('family_id', familyId)
      .eq('is_primary_contact', true)
      .maybeSingle();

    const parentEmail = parent?.email ?? '';
    const paymentPlan = (regs[0].payment_plan ?? 'full') as
      | 'full'
      | 'two_installments'
      | 'three_installments';
    const paymentMethod = resolvePaymentMethod(
      family.payment_method_preference,
      regs[0].notes
    );
    const tuitionSubtotal = regs.reduce((sum, r) => sum + Number(r.tuition_total ?? 0), 0);
    const billing = getFamilyTuitionBilling({
      tuitionSubtotal,
      paymentPlan,
      paymentMethod,
      term: regs[0].term,
    });

    const first = billing.installments[0];
    if (!first) {
      return { success: false, error: 'Could not calculate first payment.' };
    }

    const charge = await chargeSavedTuitionPayment({
      customerId: family.stripe_customer_id,
      paymentMethodId: family.stripe_payment_method_id,
      amountDollars: first.amount,
      paymentMethod,
      familyId,
      installmentNumber: 1,
      installmentTotal: billing.installments.length,
      parentEmail,
    });

    if (!charge.ok) {
      return { success: false, error: charge.error };
    }

    const pi = charge.paymentIntent;
    const piStatus = paymentIntentIsPaidOrPending(pi) ? 'succeeded' : pi.status;

    for (const reg of regs) {
      await supabase
        .from('program_registrations')
        .update({ status: 'accepted' })
        .eq('id', reg.id);
    }

    await supabase.from('payments').insert({
      source_type: 'program_registration',
      source_id: regs[0].id,
      amount: first.amount,
      stripe_payment_intent_id: pi.id,
      stripe_charge_id:
        typeof pi.latest_charge === 'string' ? pi.latest_charge : null,
      status: pi.status === 'processing' ? 'pending' : 'succeeded',
      paid_at: pi.status === 'succeeded' ? new Date().toISOString() : null,
    });

    for (const inst of billing.installments.slice(1)) {
      await supabase.from('tuition_installments').upsert(
        {
          family_id: familyId,
          installment_number: inst.number,
          amount: inst.amount,
          due_date: inst.dueDate.toISOString().slice(0, 10),
          status: 'scheduled',
        },
        { onConflict: 'family_id,installment_number' }
      );
    }

    const { data: childRegs } = await supabase
      .from('program_registrations')
      .select('children(first_name, last_name)')
      .eq('family_id', familyId)
      .eq('program_id', program.id);

    const childNames =
      childRegs?.map((r) => {
        const raw = r.children as
          | { first_name: string; last_name: string }
          | { first_name: string; last_name: string }[];
        const c = Array.isArray(raw) ? raw[0] : raw;
        return `${c.first_name} ${c.last_name}`;
      }) ?? [];

    await sendRegistrationAcceptedEmail({
      to: parentEmail,
      parentFirstName: parent?.first_name ?? 'there',
      childNames,
      amountCharged: first.amount,
      installmentNumber: 1,
      installmentTotal: billing.installments.length,
      upcomingInstallments: billing.installments.slice(1).map((i) => ({
        number: i.number,
        amount: i.amount,
        dueDate: i.dueDate.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
      })),
    });

    revalidatePath('/admin/registrations');

    const statusNote =
      pi.status === 'processing'
        ? ' ACH payment processing (may take a few days).'
        : '';

    return {
      success: true,
      message: `Charged $${formatUsd(first.amount)} (payment 1 of ${billing.installments.length}).${statusNote}`,
    };
  } catch (err) {
    console.error('acceptAndChargeFamily error:', err);
    return { success: false, error: 'Something went wrong.' };
  }
}

export async function chargeScheduledInstallment(
  installmentId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  await requireAdmin();

  try {
    const supabase = createAdminClient();

    const { data: inst } = await supabase
      .from('tuition_installments')
      .select('*')
      .eq('id', installmentId)
      .single();

    if (!inst || inst.status === 'paid') {
      return { success: false, error: 'Installment not found or already paid.' };
    }

    const { data: family } = await supabase
      .from('families')
      .select('*')
      .eq('id', inst.family_id)
      .single();

    if (!family?.stripe_customer_id || !family.stripe_payment_method_id) {
      return { success: false, error: 'Missing Stripe payment method on file.' };
    }

    const { data: parent } = await supabase
      .from('parents')
      .select('email')
      .eq('family_id', inst.family_id)
      .eq('is_primary_contact', true)
      .maybeSingle();

    const { count } = await supabase
      .from('tuition_installments')
      .select('*', { count: 'exact', head: true })
      .eq('family_id', inst.family_id);

    const paymentMethod = resolvePaymentMethod(family.payment_method_preference, null);

    const charge = await chargeSavedTuitionPayment({
      customerId: family.stripe_customer_id,
      paymentMethodId: family.stripe_payment_method_id,
      amountDollars: Number(inst.amount),
      paymentMethod,
      familyId: inst.family_id,
      installmentNumber: inst.installment_number,
      installmentTotal: count ?? inst.installment_number,
      parentEmail: parent?.email ?? '',
    });

    if (!charge.ok) {
      await supabase
        .from('tuition_installments')
        .update({ status: 'failed' })
        .eq('id', installmentId);
      return { success: false, error: charge.error };
    }

    const pi = charge.paymentIntent;

    await supabase
      .from('tuition_installments')
      .update({
        status: pi.status === 'succeeded' ? 'paid' : 'processing',
        stripe_payment_intent_id: pi.id,
        paid_at: pi.status === 'succeeded' ? new Date().toISOString() : null,
      })
      .eq('id', installmentId);

    const { data: reg } = await supabase
      .from('program_registrations')
      .select('id')
      .eq('family_id', inst.family_id)
      .limit(1)
      .maybeSingle();

    if (reg) {
      await supabase.from('payments').insert({
        source_type: 'program_registration',
        source_id: reg.id,
        amount: Number(inst.amount),
        stripe_payment_intent_id: pi.id,
        stripe_charge_id:
          typeof pi.latest_charge === 'string' ? pi.latest_charge : null,
        status: pi.status === 'processing' ? 'pending' : 'succeeded',
        paid_at: pi.status === 'succeeded' ? new Date().toISOString() : null,
      });
    }

    revalidatePath('/admin/registrations');

    return {
      success: true,
      message: `Charged $${formatUsd(Number(inst.amount))} (payment ${inst.installment_number}).`,
    };
  } catch (err) {
    console.error('chargeScheduledInstallment error:', err);
    return { success: false, error: 'Something went wrong.' };
  }
}
