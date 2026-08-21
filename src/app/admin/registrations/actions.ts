'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/admin/auth';
import { sendRegistrationAcceptedEmail } from '@/lib/email/registration-accepted';
import {
  getAchimFamilyTuitionBilling,
  resolveAchimPaymentMethod,
} from '@/lib/programs/achim-billing';
import type { AchimPaymentPlan } from '@/lib/programs/achim-tuition';
import {
  getBmxFamilyTuitionBilling,
  resolveBmxPaymentMethod,
} from '@/lib/programs/bmx-billing';
import type { BmxPaymentPlan } from '@/lib/programs/bmx-tuition';
import {
  getBloomFamilyTuitionBilling,
  resolveBloomPaymentMethod,
} from '@/lib/programs/bloom-billing';
import type { BloomPaymentPlan } from '@/lib/programs/bloom-tuition';
import {
  formatUsd,
  getFamilyTuitionBilling,
  resolvePaymentMethod,
  stripeCustomerUrl,
} from '@/lib/programs/hebrew-adventure-billing';
import type { HebrewAdventurePaymentPlan } from '@/lib/programs/hebrew-adventure-tuition';
import {
  ACHIM_NAME,
  ACHIM_PATH,
  ACHIM_SLUG,
  BLOOM_NAME,
  BLOOM_PATH,
  BLOOM_SLUG,
  BMX_NAME,
  BMX_PATH,
  BMX_SLUG,
  HEBREW_ADVENTURE_NAME,
  HEBREW_ADVENTURE_PATH,
  HEBREW_ADVENTURE_SLUG,
} from '@/lib/programs/names';
import { issueFairAccessCodesAfterAccept } from '@/lib/events/hebrew-fair-codes';
import {
  chargeSavedTuitionPayment,
} from '@/lib/stripe/charge-tuition';
import { createAdminClient } from '@/lib/supabase/server';
import {
  isOfflineTuitionMethod,
  type OfflineTuitionMethod,
} from '@/lib/programs/offline-tuition-methods';

const BILLABLE_PROGRAM_SLUGS = [HEBREW_ADVENTURE_SLUG, ACHIM_SLUG, BMX_SLUG, BLOOM_SLUG] as const;

export type PendingFamilyRegistration = {
  familyId: string;
  programSlug: string;
  programName: string;
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
  if (!(await requireCapability('registrations'))) {
    throw new Error('Unauthorized');
  }
}

function programMeta(slug: string) {
  if (slug === ACHIM_SLUG) {
    return { name: ACHIM_NAME, path: ACHIM_PATH };
  }
  if (slug === BMX_SLUG) {
    return { name: BMX_NAME, path: BMX_PATH };
  }
  if (slug === BLOOM_SLUG) {
    return { name: BLOOM_NAME, path: BLOOM_PATH };
  }
  return { name: HEBREW_ADVENTURE_NAME, path: HEBREW_ADVENTURE_PATH };
}

function familyTuitionBilling(input: {
  programSlug: string;
  tuitionSubtotal: number;
  paymentPlan: string;
  paymentMethod: 'card' | 'bank';
  term: string | null;
}) {
  if (input.programSlug === ACHIM_SLUG) {
    const plan: AchimPaymentPlan =
      input.paymentPlan === 'two_installments' ? 'two_installments' : 'full';
    return getAchimFamilyTuitionBilling({
      tuitionSubtotal: input.tuitionSubtotal,
      paymentPlan: plan,
      paymentMethod: input.paymentMethod,
      term: input.term,
    });
  }

  if (input.programSlug === BMX_SLUG) {
    const plan: BmxPaymentPlan =
      input.paymentPlan === 'two_installments' ? 'two_installments' : 'full';
    return getBmxFamilyTuitionBilling({
      tuitionSubtotal: input.tuitionSubtotal,
      paymentPlan: plan,
      paymentMethod: input.paymentMethod,
      term: input.term,
    });
  }

  if (input.programSlug === BLOOM_SLUG) {
    const plan: BloomPaymentPlan =
      input.paymentPlan === 'two_installments' ? 'two_installments' : 'full';
    return getBloomFamilyTuitionBilling({
      tuitionSubtotal: input.tuitionSubtotal,
      paymentPlan: plan,
      paymentMethod: input.paymentMethod,
      term: input.term,
    });
  }

  const plan = input.paymentPlan as HebrewAdventurePaymentPlan;
  return getFamilyTuitionBilling({
    tuitionSubtotal: input.tuitionSubtotal,
    paymentPlan: plan,
    paymentMethod: input.paymentMethod,
    term: input.term,
  });
}

export async function getPendingRegistrations(): Promise<PendingFamilyRegistration[]> {
  await requireAdmin();
  const supabase = createAdminClient();

  const { data: programs } = await supabase
    .from('programs')
    .select('id, slug, name')
    .in('slug', [...BILLABLE_PROGRAM_SLUGS]);

  if (!programs?.length) return [];

  const programById = new Map(programs.map((p) => [p.id, p]));
  const programIds = programs.map((p) => p.id);

  const { data: rows } = await supabase
    .from('program_registrations')
    .select(
      `
      id, family_id, program_id, payment_plan, tuition_total, term, notes, created_at,
      families (
        family_name, stripe_customer_id, stripe_payment_method_id, payment_method_preference
      ),
      children ( first_name, last_name, grade )
    `
    )
    .in('program_id', programIds)
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
    const key = `${row.family_id}::${row.program_id}`;
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
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

  for (const [, regs] of grouped) {
    const family = unwrapFamily(regs[0].families);
    const program = programById.get(regs[0].program_id);
    const programSlug = program?.slug ?? HEBREW_ADVENTURE_SLUG;
    const meta = programMeta(programSlug);

    const parent = parentByFamily.get(regs[0].family_id);
    const paymentPlan = regs[0].payment_plan ?? 'full';
    const term = regs[0].term;
    const paymentMethod =
      programSlug === ACHIM_SLUG
        ? resolveAchimPaymentMethod(family?.payment_method_preference, regs[0].notes)
        : programSlug === BMX_SLUG
          ? resolveBmxPaymentMethod(family?.payment_method_preference, regs[0].notes)
          : programSlug === BLOOM_SLUG
            ? resolveBloomPaymentMethod(family?.payment_method_preference, regs[0].notes)
            : resolvePaymentMethod(family?.payment_method_preference, regs[0].notes);
    const tuitionSubtotal = regs.reduce((sum, r) => sum + Number(r.tuition_total ?? 0), 0);
    const billing = familyTuitionBilling({
      programSlug,
      tuitionSubtotal,
      paymentPlan,
      paymentMethod,
      term,
    });

    results.push({
      familyId: regs[0].family_id,
      programSlug,
      programName: program?.name ?? meta.name,
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
  familyId: string,
  programSlug: string = HEBREW_ADVENTURE_SLUG
): Promise<{ success: boolean; error?: string; message?: string }> {
  await requireAdmin();

  try {
    const supabase = createAdminClient();
    const meta = programMeta(programSlug);

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
      .select('id, name')
      .eq('slug', programSlug)
      .single();

    if (!program?.id) {
      return { success: false, error: `${meta.name} program not found.` };
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
    const paymentPlan = regs[0].payment_plan ?? 'full';
    const paymentMethod =
      programSlug === ACHIM_SLUG
        ? resolveAchimPaymentMethod(family.payment_method_preference, regs[0].notes)
        : programSlug === BMX_SLUG
          ? resolveBmxPaymentMethod(family.payment_method_preference, regs[0].notes)
          : programSlug === BLOOM_SLUG
            ? resolveBloomPaymentMethod(family.payment_method_preference, regs[0].notes)
            : resolvePaymentMethod(family.payment_method_preference, regs[0].notes);
    const tuitionSubtotal = regs.reduce((sum, r) => sum + Number(r.tuition_total ?? 0), 0);
    const billing = familyTuitionBilling({
      programSlug,
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

    for (const reg of regs) {
      await supabase
        .from('program_registrations')
        .update({ status: 'accepted' })
        .eq('id', reg.id);
    }

    // Issue unique Hebrew event free-entry codes (Adventure only; no email yet).
    await issueFairAccessCodesAfterAccept({
      programSlug,
      registrationIds: regs.map((r) => r.id),
    });

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
      programName: program.name ?? meta.name,
      programPath: meta.path,
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

/** Admin-only offline payment methods when accepting without charging Stripe. */

function formatMethodLabel(method: OfflineTuitionMethod, detail?: string): string {
  const d = (detail ?? '').trim();
  if (method === 'Check' && d) return `Check #${d.replace(/^#+/, '')}`;
  if (method === 'Other' && d) return d;
  return method;
}

/**
 * Accept pending registrations without charging and without recording payment yet.
 * Schedules installment 1+ so you can record check/Zelle/etc. later.
 */
export async function acceptFamilyOnly(
  familyId: string,
  programSlug: string = HEBREW_ADVENTURE_SLUG
): Promise<{ success: boolean; error?: string; message?: string }> {
  await requireAdmin();

  try {
    const supabase = createAdminClient();
    const meta = programMeta(programSlug);

    const { data: family } = await supabase
      .from('families')
      .select('*')
      .eq('id', familyId)
      .single();

    if (!family) {
      return { success: false, error: 'Family not found.' };
    }

    const { data: program } = await supabase
      .from('programs')
      .select('id, name')
      .eq('slug', programSlug)
      .single();

    if (!program?.id) {
      return { success: false, error: `${meta.name} program not found.` };
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
    const paymentPlan = regs[0].payment_plan ?? 'full';
    const paymentMethod =
      programSlug === ACHIM_SLUG
        ? resolveAchimPaymentMethod(family.payment_method_preference, regs[0].notes)
        : programSlug === BMX_SLUG
          ? resolveBmxPaymentMethod(family.payment_method_preference, regs[0].notes)
          : programSlug === BLOOM_SLUG
            ? resolveBloomPaymentMethod(family.payment_method_preference, regs[0].notes)
            : resolvePaymentMethod(family.payment_method_preference, regs[0].notes);
    const tuitionSubtotal = regs.reduce((sum, r) => sum + Number(r.tuition_total ?? 0), 0);
    const billing = familyTuitionBilling({
      programSlug,
      tuitionSubtotal,
      paymentPlan,
      paymentMethod,
      term: regs[0].term,
    });

    const first = billing.installments[0];
    if (!first) {
      return { success: false, error: 'Could not calculate first payment.' };
    }

    for (const reg of regs) {
      const noteLine = `Accepted without charging — payment 1 ($${first.amount.toFixed(2)}) awaiting offline payment`;
      const nextNotes = [reg.notes?.trim(), noteLine].filter(Boolean).join('\n');
      await supabase
        .from('program_registrations')
        .update({ status: 'accepted', notes: nextNotes })
        .eq('id', reg.id);
    }

    await issueFairAccessCodesAfterAccept({
      programSlug,
      registrationIds: regs.map((r) => r.id),
    });

    // Schedule ALL installments including #1 so payment can be recorded later.
    for (const inst of billing.installments) {
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

    if (parentEmail) {
      await sendRegistrationAcceptedEmail({
        to: parentEmail,
        parentFirstName: parent?.first_name ?? 'there',
        childNames,
        amountCharged: first.amount,
        installmentNumber: 1,
        installmentTotal: billing.installments.length,
        upcomingInstallments: billing.installments.map((i) => ({
          number: i.number,
          amount: i.amount,
          dueDate: i.dueDate.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          }),
        })),
        programName: program.name ?? meta.name,
        programPath: meta.path,
        paymentDeferred: true,
      });
    }

    revalidatePath('/admin/registrations');

    return {
      success: true,
      message: `Accepted without charging. Payment 1 ($${formatUsd(first.amount)}) is listed under Scheduled — use “Record payment” when the check/Zelle/etc. arrives.`,
    };
  } catch (err) {
    console.error('acceptFamilyOnly error:', err);
    return { success: false, error: 'Something went wrong.' };
  }
}

/**
 * Accept pending registrations without charging the saved Stripe method.
 * Records payment 1 in the ledger as paid via the chosen offline method (check, Zelle, etc.).
 */
export async function acceptFamilyOffline(
  familyId: string,
  programSlug: string = HEBREW_ADVENTURE_SLUG,
  options: {
    paymentMethod: OfflineTuitionMethod;
    /** Optional detail (check #, Other label). */
    paymentDetail?: string;
    /** Amount to record (defaults to installment 1). */
    amountPaid?: number;
  }
): Promise<{ success: boolean; error?: string; message?: string }> {
  await requireAdmin();

  try {
    const supabase = createAdminClient();
    const meta = programMeta(programSlug);
    const method = options.paymentMethod;
    if (!isOfflineTuitionMethod(method)) {
      return { success: false, error: 'Choose a payment method (Zelle, Cash, Check, …).' };
    }

    const methodLabel = formatMethodLabel(method, options.paymentDetail);

    const { data: family } = await supabase
      .from('families')
      .select('*')
      .eq('id', familyId)
      .single();

    if (!family) {
      return { success: false, error: 'Family not found.' };
    }

    const { data: program } = await supabase
      .from('programs')
      .select('id, name')
      .eq('slug', programSlug)
      .single();

    if (!program?.id) {
      return { success: false, error: `${meta.name} program not found.` };
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
    const paymentPlan = regs[0].payment_plan ?? 'full';
    const paymentMethod =
      programSlug === ACHIM_SLUG
        ? resolveAchimPaymentMethod(family.payment_method_preference, regs[0].notes)
        : programSlug === BMX_SLUG
          ? resolveBmxPaymentMethod(family.payment_method_preference, regs[0].notes)
          : programSlug === BLOOM_SLUG
            ? resolveBloomPaymentMethod(family.payment_method_preference, regs[0].notes)
            : resolvePaymentMethod(family.payment_method_preference, regs[0].notes);
    const tuitionSubtotal = regs.reduce((sum, r) => sum + Number(r.tuition_total ?? 0), 0);
    const billing = familyTuitionBilling({
      programSlug,
      tuitionSubtotal,
      paymentPlan,
      paymentMethod,
      term: regs[0].term,
    });

    const first = billing.installments[0];
    if (!first) {
      return { success: false, error: 'Could not calculate first payment.' };
    }

    const amountPaid =
      options.amountPaid != null && Number.isFinite(options.amountPaid) && options.amountPaid > 0
        ? Math.round(options.amountPaid * 100) / 100
        : first.amount;

    const paidAt = new Date().toISOString();
    const paymentKey = `manual:tuition-${method.toLowerCase()}-${familyId.slice(0, 8)}-${Date.now()}`;

    for (const reg of regs) {
      const noteLine = `Accepted offline via ${methodLabel} · payment 1 $${amountPaid.toFixed(2)}`;
      const nextNotes = [reg.notes?.trim(), noteLine].filter(Boolean).join('\n');
      await supabase
        .from('program_registrations')
        .update({ status: 'accepted', notes: nextNotes })
        .eq('id', reg.id);
    }

    await issueFairAccessCodesAfterAccept({
      programSlug,
      registrationIds: regs.map((r) => r.id),
    });

    await supabase.from('payments').insert({
      source_type: 'program_registration',
      source_id: regs[0].id,
      amount: amountPaid,
      stripe_payment_intent_id: paymentKey,
      stripe_charge_id: null,
      status: 'succeeded',
      paid_at: paidAt,
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

    if (parentEmail) {
      await sendRegistrationAcceptedEmail({
        to: parentEmail,
        parentFirstName: parent?.first_name ?? 'there',
        childNames,
        amountCharged: amountPaid,
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
        programName: program.name ?? meta.name,
        programPath: meta.path,
        offlinePaymentMethod: methodLabel,
      });
    }

    revalidatePath('/admin/registrations');

    return {
      success: true,
      message: `Accepted offline via ${methodLabel}. Recorded $${formatUsd(amountPaid)} (payment 1 of ${billing.installments.length}). No Stripe charge.`,
    };
  } catch (err) {
    console.error('acceptFamilyOffline error:', err);
    return { success: false, error: 'Something went wrong.' };
  }
}

/**
 * Record an offline payment (check/Zelle/etc.) against a scheduled tuition installment.
 * Use after Accept only, or for any later installment paid offline.
 */
export async function recordOfflineInstallmentPayment(
  installmentId: string,
  options: {
    paymentMethod: OfflineTuitionMethod;
    paymentDetail?: string;
    amountPaid?: number;
  }
): Promise<{ success: boolean; error?: string; message?: string }> {
  await requireAdmin();

  try {
    const supabase = createAdminClient();
    const method = options.paymentMethod;
    if (!isOfflineTuitionMethod(method)) {
      return { success: false, error: 'Choose a payment method (Zelle, Cash, Check, …).' };
    }
    const methodLabel = formatMethodLabel(method, options.paymentDetail);

    const { data: inst } = await supabase
      .from('tuition_installments')
      .select('*')
      .eq('id', installmentId)
      .single();

    if (!inst || inst.status === 'paid') {
      return { success: false, error: 'Installment not found or already paid.' };
    }

    const amountPaid =
      options.amountPaid != null && Number.isFinite(options.amountPaid) && options.amountPaid > 0
        ? Math.round(options.amountPaid * 100) / 100
        : Number(inst.amount);

    const paidAt = new Date().toISOString();
    const paymentKey = `manual:tuition-${method.toLowerCase()}-inst${inst.installment_number}-${inst.family_id.slice(0, 8)}-${Date.now()}`;

    // Link payment to an accepted program_registration when possible.
    const { data: programs } = await supabase
      .from('programs')
      .select('id')
      .in('slug', [...BILLABLE_PROGRAM_SLUGS]);
    const programIds = (programs ?? []).map((p) => p.id);

    let sourceId: string | null = null;
    if (programIds.length) {
      const { data: reg } = await supabase
        .from('program_registrations')
        .select('id')
        .eq('family_id', inst.family_id)
        .in('program_id', programIds)
        .in('status', ['accepted', 'active'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      sourceId = reg?.id ?? null;
    }

    await supabase
      .from('tuition_installments')
      .update({
        status: 'paid',
        paid_at: paidAt,
        stripe_payment_intent_id: paymentKey,
      })
      .eq('id', installmentId);

    await supabase.from('payments').insert({
      source_type: 'program_registration',
      source_id: sourceId ?? installmentId,
      amount: amountPaid,
      stripe_payment_intent_id: paymentKey,
      stripe_charge_id: null,
      status: 'succeeded',
      paid_at: paidAt,
    });

    revalidatePath('/admin/registrations');

    return {
      success: true,
      message: `Recorded payment ${inst.installment_number} ($${formatUsd(amountPaid)}) via ${methodLabel}.`,
    };
  } catch (err) {
    console.error('recordOfflineInstallmentPayment error:', err);
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
