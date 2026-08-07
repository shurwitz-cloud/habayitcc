'use server';

import { logFormSubmission } from '@/lib/admin/form-log';
import { createAdminClient } from '@/lib/supabase/server';
import { assertSupabaseWriteReady } from '@/lib/supabase/require-write';
import { insertWithSchemaFallback } from '@/lib/supabase/insert-helpers';
import { bloomRegistrationRow } from '@/lib/google/sheets';
import { BLOOM_NAME, BLOOM_PATH, BLOOM_SLUG } from '@/lib/programs/names';
import { stripe } from '@/lib/stripe/server';
import {
  getBloomSessionTuition,
  type BloomPaymentPlan,
  type BloomPaymentMethod,
} from '@/lib/programs/bloom-tuition';
import { sendRegistrationReceivedEmail } from '@/lib/email/registration-received';
import { enforceActionRateLimit } from '@/lib/security/action-rate-limit';

export interface ChildInput {
  firstName: string;
  lastName: string;
  hebrewName: string;
  dateOfBirth: string;
  bornBeforeSunset: 'before' | 'after' | 'unknown' | '';
  grade: string;
  schoolAttending: string;
  attendedBefore: string;
  previousProgramName: string;
  hasIepOrNeeds: string;
  iepOrNeedsDetails: string;
  hebrewLevel: string;
  allergies: string;
}

function buildChildNotes(child: ChildInput): string | null {
  const parts: string[] = [];
  if (child.attendedBefore === 'yes' && child.previousProgramName.trim()) {
    parts.push(`Previous Hebrew program: ${child.previousProgramName.trim()}`);
  }
  if (child.hasIepOrNeeds === 'yes' && child.iepOrNeedsDetails.trim()) {
    parts.push(`IEP / educational needs: ${child.iepOrNeedsDetails.trim()}`);
  } else if (child.hasIepOrNeeds === 'no') {
    parts.push('IEP / educational needs: none reported');
  }
  return parts.length ? parts.join('\n') : null;
}

export interface RegistrationInput {
  parent1FirstName: string;
  parent1LastName: string;
  parent1Phone: string;
  parent1Email: string;
  parent2FirstName: string;
  parent2LastName: string;
  parent2Phone: string;
  parent2Email: string;
  motherStatus: string;
  motherConversionOrg: string;
  motherConversionRabbi: string;
  fatherStatus: string;
  fatherConversionOrg: string;
  fatherConversionRabbi: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  emergencyContact: string;
  emergencyPhone: string;
  children: ChildInput[];
  isChaiPartner: boolean;
  chaiPartnerCode: string;
  paymentPlan: BloomPaymentPlan | '';
  paymentMethod: BloomPaymentMethod | '';
  stripeSetupIntentId: string;
  agreedToPolicies: boolean;
  notes: string;
}

export interface RegistrationResult {
  success: boolean;
  error?: string;
}

function paymentPlanLabel(plan: BloomPaymentPlan): string {
  switch (plan) {
    case 'full':
      return 'Pay in full upon acceptance';
    case 'two_installments':
      return 'Two payments (acceptance + by November 1)';
  }
}

export async function submitBloomRegistration(
  input: RegistrationInput
): Promise<RegistrationResult> {
  const limited = await enforceActionRateLimit('bloom-register', 8, 15 * 60 * 1000);
  if (!limited.ok) return { success: false, error: limited.error };

  const ready = assertSupabaseWriteReady();
  if (!ready.ok) return { success: false, error: ready.error };

  try {
    if (!input.agreedToPolicies) {
      return { success: false, error: 'Please agree to the program policies to continue.' };
    }

    if (!input.children?.length) {
      return { success: false, error: 'Please add at least one child.' };
    }

    for (const child of input.children) {
      if (!child.firstName.trim() || !child.lastName.trim() || !child.grade.trim()) {
        return {
          success: false,
          error: 'Each child needs a first name, last name, and grade.',
        };
      }
      if (!child.attendedBefore) {
        return {
          success: false,
          error: `Please indicate whether ${child.firstName || 'each child'} has attended a Hebrew program before.`,
        };
      }
      if (child.attendedBefore === 'yes' && !child.previousProgramName?.trim()) {
        return {
          success: false,
          error: `Please enter the name of the previous Hebrew program for ${child.firstName || 'each child'}.`,
        };
      }
      if (!child.hasIepOrNeeds) {
        return {
          success: false,
          error: `Please indicate whether ${child.firstName || 'each child'} has an IEP or specific educational needs.`,
        };
      }
      if (child.hasIepOrNeeds === 'yes' && !child.iepOrNeedsDetails?.trim()) {
        return {
          success: false,
          error: `Please specify the IEP or educational needs for ${child.firstName || 'each child'}.`,
        };
      }
    }

    const supabase = createAdminClient();

    if (input.isChaiPartner) {
      const { data: partner, error: partnerError } = await supabase
        .from('chai_partners')
        .select('id, status')
        .eq('access_code', input.chaiPartnerCode.trim().toUpperCase())
        .maybeSingle();

      if (partnerError || !partner || partner.status !== 'active') {
        return { success: false, error: 'Chai Partner code could not be verified.' };
      }
    }

    if (
      input.motherStatus === 'jewish_by_conversion' &&
      (!input.motherConversionOrg.trim() || !input.motherConversionRabbi.trim())
    ) {
      return {
        success: false,
        error: "Please enter the mother's conversion Beit Din / organization and certifying rabbi.",
      };
    }

    if (
      input.fatherStatus === 'jewish_by_conversion' &&
      (!input.fatherConversionOrg.trim() || !input.fatherConversionRabbi.trim())
    ) {
      return {
        success: false,
        error: "Please enter the father's conversion Beit Din / organization and certifying rabbi.",
      };
    }

    if (!input.paymentPlan) {
      return { success: false, error: 'Please select a payment plan.' };
    }
    if (!input.paymentMethod) {
      return { success: false, error: 'Please select a payment method.' };
    }
    if (!input.stripeSetupIntentId?.trim()) {
      return { success: false, error: 'Please enter your payment details.' };
    }

    const setupIntent = await stripe.setupIntents.retrieve(input.stripeSetupIntentId);
    if (setupIntent.status !== 'succeeded') {
      return { success: false, error: 'Payment method was not saved. Please try again.' };
    }

    const parentEmail = input.parent1Email.trim().toLowerCase();
    if (!parentEmail || !input.parent1FirstName.trim() || !input.parent1LastName.trim()) {
      return { success: false, error: 'Parent 1 name and email are required.' };
    }

    const setupEmail = setupIntent.metadata?.email?.toLowerCase();
    if (setupEmail && setupEmail !== parentEmail) {
      return { success: false, error: 'Payment verification failed. Please try again.' };
    }

    const stripePaymentMethodId =
      typeof setupIntent.payment_method === 'string'
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id ?? null;

    if (!stripePaymentMethodId) {
      return { success: false, error: 'Payment method could not be verified.' };
    }

    let stripeCustomerId =
      typeof setupIntent.customer === 'string'
        ? setupIntent.customer
        : setupIntent.customer?.id ?? null;

    const customerMetadata = {
      source: 'bloom_registration',
      payment_plan: input.paymentPlan,
      payment_method_preference: input.paymentMethod,
    };
    const customerName = `${input.parent1FirstName} ${input.parent1LastName}`.trim() || undefined;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: parentEmail,
        name: customerName,
        metadata: customerMetadata,
      });
      stripeCustomerId = customer.id;
      await stripe.paymentMethods.attach(stripePaymentMethodId, { customer: stripeCustomerId });
    }

    await stripe.customers.update(stripeCustomerId, {
      email: parentEmail,
      name: customerName,
      invoice_settings: { default_payment_method: stripePaymentMethodId },
      metadata: customerMetadata,
    });

    await logFormSubmission({
      formType: 'bloom_registration',
      email: parentEmail,
      payload: {
        ...input,
        stripeSetupIntentId: input.stripeSetupIntentId,
        stripeCustomerId,
        stripePaymentMethodId,
      },
    });

    const paymentMethodNote =
      input.paymentMethod === 'card'
        ? 'Payment method: Credit card (+3% processing fee)'
        : 'Payment method: Bank account (ACH, no fee)';

    const familyRow = {
      family_name: `${input.parent1LastName.trim()} Family`,
      street_address: input.streetAddress.trim(),
      city: input.city.trim(),
      state: input.state.trim(),
      zip: input.zip.trim(),
      notes: input.notes?.trim() || null,
      emergency_contact_name: input.emergencyContact?.trim() || null,
      emergency_contact_phone: input.emergencyPhone?.trim() || null,
      stripe_customer_id: stripeCustomerId,
      stripe_payment_method_id: stripePaymentMethodId,
      payment_method_preference: input.paymentMethod,
    };

    const familyResult = await insertWithSchemaFallback(familyRow, async (payload) =>
      supabase.from('families').insert(payload).select('id').single()
    );
    const family = familyResult.data as { id: string } | null;
    const familyError = familyResult.error;

    if (familyError || !family) {
      console.error('[bloom registration] family insert error:', familyError);
      return { success: false, error: 'Could not create family record.' };
    }

    const parentRows = [
      {
        family_id: family.id,
        first_name: input.parent1FirstName.trim(),
        last_name: input.parent1LastName.trim(),
        email: parentEmail,
        phone: input.parent1Phone?.trim() || null,
        relationship: 'Mother',
        jewish_status: input.motherStatus,
        conversion_org: input.motherConversionOrg?.trim() || null,
        conversion_rabbi: input.motherConversionRabbi?.trim() || null,
        is_primary_contact: true,
      },
    ];
    if (input.parent2FirstName?.trim()) {
      parentRows.push({
        family_id: family.id,
        first_name: input.parent2FirstName.trim(),
        last_name: input.parent2LastName.trim(),
        email: input.parent2Email?.trim().toLowerCase() || '',
        phone: input.parent2Phone?.trim() || null,
        relationship: 'Father',
        jewish_status: input.fatherStatus,
        conversion_org: input.fatherConversionOrg?.trim() || null,
        conversion_rabbi: input.fatherConversionRabbi?.trim() || null,
        is_primary_contact: false,
      });
    }

    const { error: parentsError } = await supabase.from('parents').insert(parentRows);
    if (parentsError) {
      console.error('[bloom registration] parents insert error:', parentsError);
      return { success: false, error: 'Could not save parent information.' };
    }

    const { data: existingProgram } = await supabase
      .from('programs')
      .select('id')
      .eq('slug', BLOOM_SLUG)
      .maybeSingle();

    let programId = existingProgram?.id ?? null;
    if (!programId) {
      const { data: createdProgram, error: programError } = await supabase
        .from('programs')
        .upsert(
          {
            slug: BLOOM_SLUG,
            name: BLOOM_NAME,
            description:
              '6th grade girls Bat Mitzvah club — every other Wednesday, September through May',
          },
          { onConflict: 'slug' }
        )
        .select('id')
        .single();

      if (programError || !createdProgram?.id) {
        console.error('[bloom registration] could not create program:', programError);
        return {
          success: false,
          error: 'Program setup is incomplete. Please contact HaBayit and try again shortly.',
        };
      }
      programId = createdProgram.id;
    }

    for (let i = 0; i < input.children.length; i++) {
      const child = input.children[i];

      const childNotes = buildChildNotes(child);
      const childRow = {
        family_id: family.id,
        first_name: child.firstName.trim(),
        last_name: child.lastName.trim(),
        hebrew_name: child.hebrewName?.trim() || null,
        date_of_birth: child.dateOfBirth || null,
        born_before_sunset: child.bornBeforeSunset === 'before',
        born_sunset_timing: child.bornBeforeSunset || null,
        grade: child.grade.trim(),
        school_attending: child.schoolAttending?.trim() || null,
        attended_before: child.attendedBefore?.trim() || null,
        hebrew_level: child.hebrewLevel?.trim() || null,
        allergies: child.allergies?.trim() || null,
        notes: childNotes,
      };

      const childResult = await insertWithSchemaFallback(childRow, async (payload) =>
        supabase.from('children').insert(payload).select('id').single()
      );
      const childRowData = childResult.data as { id: string } | null;
      const childError = childResult.error;

      if (childError || !childRowData) {
        console.error('[bloom registration] child insert error:', childError, child);
        return {
          success: false,
          error: `Could not save information for ${child.firstName}. Please contact us.`,
        };
      }

      const tuitionTotal = getBloomSessionTuition(
        input.isChaiPartner,
        input.paymentPlan || 'full'
      );

      const { error: regError } = await supabase.from('program_registrations').insert({
        program_id: programId,
        child_id: childRowData.id,
        family_id: family.id,
        term: '2026-2027',
        status: 'pending',
        is_chai_partner_rate: input.isChaiPartner,
        chai_partner_code_used: input.isChaiPartner ? input.chaiPartnerCode.trim().toUpperCase() : null,
        payment_plan: input.paymentPlan || 'full',
        tuition_total: tuitionTotal,
        notes:
          [
            paymentMethodNote,
            child.hebrewLevel ? `Hebrew level: ${child.hebrewLevel}` : '',
            child.attendedBefore
              ? child.attendedBefore === 'yes' && child.previousProgramName.trim()
                ? `Attended Hebrew program before: yes (${child.previousProgramName.trim()})`
                : `Attended Hebrew program before: ${child.attendedBefore}`
              : '',
            child.hasIepOrNeeds === 'yes' && child.iepOrNeedsDetails.trim()
              ? `IEP / educational needs: ${child.iepOrNeedsDetails.trim()}`
              : child.hasIepOrNeeds === 'no'
                ? 'IEP / educational needs: none reported'
                : '',
          ]
            .filter(Boolean)
            .join(' · ') || paymentMethodNote,
      });

      if (regError) {
        console.error('[bloom registration] program_registrations insert error:', regError);
        return {
          success: false,
          error: `Could not save registration for ${child.firstName}. Please contact us.`,
        };
      }
    }

    const { error: waiverError } = await supabase.from('waivers').insert({
      family_id: family.id,
      waiver_type: 'bloom_policies',
      signed_by: `${input.parent1FirstName} ${input.parent1LastName}`.trim(),
      document_version: '2026-v1',
    });
    if (waiverError) {
      console.error('[bloom registration] waiver insert error:', waiverError);
    }

    void bloomRegistrationRow({
      parent1First: input.parent1FirstName,
      parent1Last: input.parent1LastName,
      parent1Email: parentEmail,
      parent1Phone: input.parent1Phone,
      parent2First: input.parent2FirstName,
      parent2Last: input.parent2LastName,
      parent2Email: input.parent2Email,
      parent2Phone: input.parent2Phone,
      street: input.streetAddress,
      city: input.city,
      state: input.state,
      zip: input.zip,
      emergencyContact: input.emergencyContact,
      emergencyPhone: input.emergencyPhone,
      isChaiPartner: input.isChaiPartner,
      chaiCode: input.chaiPartnerCode,
      paymentPlan: `${input.paymentPlan} (${input.paymentMethod === 'card' ? 'card +3%' : 'bank'})`,
      notes: [paymentMethodNote, input.notes].filter(Boolean).join('\n\n'),
      children: input.children.map((c) => ({
        firstName: c.firstName,
        lastName: c.lastName,
        hebrewName: c.hebrewName,
        dateOfBirth: c.dateOfBirth,
        grade: c.grade,
        schoolAttending: c.schoolAttending,
        hebrewLevel: c.hebrewLevel,
        allergies: c.allergies,
      })),
    });

    void logFormSubmission({
      formType: 'bloom_registration',
      email: parentEmail,
      sourceId: family.id,
      payload: {
        ...input,
        stripeSetupIntentId: input.stripeSetupIntentId,
        stripeCustomerId,
        stripePaymentMethodId,
        children: input.children,
      },
    });

    await sendRegistrationReceivedEmail({
      to: parentEmail,
      parentFirstName: input.parent1FirstName,
      childNames: input.children.map((c) => `${c.firstName} ${c.lastName}`.trim()),
      paymentPlanLabel: paymentPlanLabel(input.paymentPlan),
      paymentMethodLabel:
        input.paymentMethod === 'card' ? 'Credit card (+3% fee)' : 'Bank account (ACH, no fee)',
      programName: BLOOM_NAME,
      programPath: BLOOM_PATH,
    });

    return { success: true };
  } catch (err) {
    console.error('HaBayit Bloom registration error:', err);
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}
