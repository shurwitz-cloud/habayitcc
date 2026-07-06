'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { hebrewAdventureRow } from '@/lib/google/sheets';
import { HEBREW_ADVENTURE_SLUG } from '@/lib/programs/names';
import { stripe } from '@/lib/stripe/server';
import {
  getHebrewAdventureSessionTuition,
  getHebrewAdventureSiblingDiscount,
  type HebrewAdventurePaymentPlan,
  type HebrewAdventurePaymentMethod,
} from '@/lib/programs/hebrew-adventure-tuition';
import { sendRegistrationReceivedEmail } from '@/lib/email/registration-received';

export interface ChildInput {
  firstName: string;
  lastName: string;
  hebrewName: string;
  dateOfBirth: string;
  bornBeforeSunset: 'before' | 'after' | 'unknown' | '';
  grade: string;
  schoolAttending: string;
  attendedBefore: string;
  hebrewLevel: string;
  allergies: string;
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
  paymentPlan: HebrewAdventurePaymentPlan | '';
  paymentMethod: HebrewAdventurePaymentMethod | '';
  stripeSetupIntentId: string;
  agreedToPolicies: boolean;
  notes: string;
}

export interface RegistrationResult {
  success: boolean;
  error?: string;
}

/**
 * Submits a HaBayit Hebrew Adventure registration. Validates the Chai Partner
 * access code, verifies a saved Stripe payment method (SetupIntent), then
 * writes family + registration records. Tuition is charged upon acceptance.
 */
export async function submitHebrewSchoolRegistration(
  input: RegistrationInput
): Promise<RegistrationResult> {
  try {
    const supabase = createAdminClient();

    // Verify Chai Partner code if claimed
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
        error: 'Please enter the mother\'s conversion Beit Din / organization and certifying rabbi.',
      };
    }

    if (
      input.fatherStatus === 'jewish_by_conversion' &&
      (!input.fatherConversionOrg.trim() || !input.fatherConversionRabbi.trim())
    ) {
      return {
        success: false,
        error: 'Please enter the father\'s conversion Beit Din / organization and certifying rabbi.',
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
    if (!parentEmail) {
      return { success: false, error: 'Parent email is required.' };
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
      source: 'hebrew_adventure_registration',
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

    const paymentMethodNote =
      input.paymentMethod === 'card'
        ? 'Payment method: Credit card (+3% processing fee)'
        : 'Payment method: Bank account (ACH, no fee)';

    // Create the family record
    const { data: family, error: familyError } = await supabase
      .from('families')
      .insert({
        family_name: `${input.parent1LastName} Family`,
        street_address: input.streetAddress,
        city: input.city,
        state: input.state,
        zip: input.zip,
        stripe_customer_id: stripeCustomerId,
        stripe_payment_method_id: stripePaymentMethodId,
        payment_method_preference: input.paymentMethod,
      })
      .select()
      .single();

    if (familyError || !family) {
      return { success: false, error: 'Could not create family record.' };
    }

    // Create parent records
    const parentRows = [
      {
        family_id: family.id,
        first_name: input.parent1FirstName,
        last_name: input.parent1LastName,
        email: input.parent1Email,
        phone: input.parent1Phone,
        relationship: 'Mother',
        jewish_status: input.motherStatus,
        conversion_org: input.motherConversionOrg || null,
        conversion_rabbi: input.motherConversionRabbi || null,
        is_primary_contact: true,
      },
    ];
    if (input.parent2FirstName) {
      parentRows.push({
        family_id: family.id,
        first_name: input.parent2FirstName,
        last_name: input.parent2LastName,
        email: input.parent2Email,
        phone: input.parent2Phone,
        relationship: 'Father',
        jewish_status: input.fatherStatus,
        conversion_org: input.fatherConversionOrg || null,
        conversion_rabbi: input.fatherConversionRabbi || null,
        is_primary_contact: false,
      });
    }
    await supabase.from('parents').insert(parentRows);

    // Look up the program by slug
    const { data: program } = await supabase
      .from('programs')
      .select('id')
      .eq('slug', HEBREW_ADVENTURE_SLUG)
      .single();

    // Create child + registration records
    for (let i = 0; i < input.children.length; i++) {
      const child = input.children[i];

      const { data: childRow, error: childError } = await supabase
        .from('children')
        .insert({
          family_id: family.id,
          first_name: child.firstName,
          last_name: child.lastName,
          hebrew_name: child.hebrewName || null,
          date_of_birth: child.dateOfBirth || null,
          born_before_sunset: child.bornBeforeSunset === 'before',
          grade: child.grade,
          school_attending: child.schoolAttending,
          allergies: child.allergies || null,
        })
        .select()
        .single();

      if (childError || !childRow) continue;

      const baseTuition = getHebrewAdventureSessionTuition(input.isChaiPartner);
      const discount = getHebrewAdventureSiblingDiscount(i);
      const tuitionTotal = baseTuition - discount;

      await supabase.from('program_registrations').insert({
        program_id: program?.id,
        child_id: childRow.id,
        family_id: family.id,
        term: '2026-2027',
        status: 'pending',
        is_chai_partner_rate: input.isChaiPartner,
        chai_partner_code_used: input.isChaiPartner ? input.chaiPartnerCode : null,
        payment_plan: input.paymentPlan || 'full',
        tuition_total: tuitionTotal,
        notes: paymentMethodNote,
      });
    }

    // Record the policy waiver
    await supabase.from('waivers').insert({
      family_id: family.id,
      waiver_type: 'hebrew_school_policies',
      signed_by: `${input.parent1FirstName} ${input.parent1LastName}`,
      document_version: '2026-v1',
    });

    // Append to Google Sheets (best-effort)
    void hebrewAdventureRow({
      parent1First: input.parent1FirstName,
      parent1Last: input.parent1LastName,
      parent1Email: input.parent1Email,
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

    await sendRegistrationReceivedEmail({
      to: input.parent1Email,
      parentFirstName: input.parent1FirstName,
      childNames: input.children.map((c) => `${c.firstName} ${c.lastName}`.trim()),
      paymentPlan: input.paymentPlan,
      paymentMethod: input.paymentMethod,
    });

    return { success: true };
  } catch (err) {
    console.error('HaBayit Hebrew Adventure registration error:', err);
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}
