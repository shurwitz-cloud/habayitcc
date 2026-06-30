'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { hebrewSchoolRow } from '@/lib/google/sheets';

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
  paymentPlan: 'full' | 'two_installments' | '';
  agreedToPolicies: boolean;
  agreedToPhotoPermission: boolean;
  notes: string;
}

export interface RegistrationResult {
  success: boolean;
  error?: string;
}

/**
 * Submits a Hebrew School registration. Validates the Chai Partner
 * access code against the chai_partners table before applying the
 * discounted rate, then writes a family + parents + children +
 * program_registrations record set to Supabase.
 *
 * NOTE: card collection is intentionally NOT handled here. Per the
 * architecture decision to use embedded Stripe Elements, actual
 * payment collection will be wired in a follow-up phase once Stripe
 * is connected. This action currently records the registration and
 * payment *intent* (plan selected, tuition calculated) so the
 * registration flow is fully testable before Stripe goes live.
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

    // Create the family record
    const { data: family, error: familyError } = await supabase
      .from('families')
      .insert({
        family_name: `${input.parent1LastName} Family`,
        street_address: input.streetAddress,
        city: input.city,
        state: input.state,
        zip: input.zip,
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

    // Look up the Hebrew School program
    const { data: program } = await supabase
      .from('programs')
      .select('id')
      .eq('slug', 'hebrew-school')
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

      const baseTuition = input.isChaiPartner ? 1000 : 1100;
      const discount = i === 1 ? 50 : i >= 2 ? 75 : 0;
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
    void hebrewSchoolRow({
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
      paymentPlan: input.paymentPlan,
      notes: input.notes,
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

    return { success: true };
  } catch (err) {
    console.error('Hebrew School registration error:', err);
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}
