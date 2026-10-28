import { createAdminClient } from '@/lib/supabase/server';
import {
  lookupHebrewBirthday,
  type HebrewBirthdayResult,
  type SunsetTiming,
} from '@/lib/hebrew-birthday/hebcal-converter';
import { buildHebrewBirthdayNotes } from '@/lib/hebrew-birthday/notes';
import { syncImportantDateToSheet } from '@/lib/google/important-dates-sheet';

export interface ApplyHebrewBirthdayInput {
  childId: string;
  familyId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  bornSunsetTiming?: SunsetTiming;
  bornBeforeSunset?: boolean | null;
}

export async function applyHebrewBirthdayForChild(
  input: ApplyHebrewBirthdayInput,
): Promise<{ success: boolean; result?: HebrewBirthdayResult; error?: string }> {
  const result = await lookupHebrewBirthday({
    dateOfBirth: input.dateOfBirth,
    bornSunsetTiming: input.bornSunsetTiming,
    bornBeforeSunset: input.bornBeforeSunset,
  });

  if (!result) {
    return { success: false, error: 'Could not convert date of birth to Hebrew calendar.' };
  }

  const supabase = createAdminClient();
  const label = `${input.firstName.trim()} ${input.lastName.trim()}`.trim();
  const notes = buildHebrewBirthdayNotes(input.bornSunsetTiming);

  const { error: childError } = await supabase
    .from('children')
    .update({
      hebrew_birthday: result.english,
      hebrew_birthday_hebrew: result.hebrew,
      hebrew_birthday_year: result.hebrewYear,
    })
    .eq('id', input.childId);

  if (childError) {
    if (/column .* does not exist|Could not find the .* column/i.test(childError.message)) {
      console.warn('[hebrew-birthday] children.hebrew_birthday columns missing; skipping child update');
    } else {
      console.error('[hebrew-birthday] child update failed:', childError.message);
      return { success: false, error: childError.message };
    }
  }

  const { data: existingDate } = await supabase
    .from('important_dates')
    .select('id')
    .eq('child_id', input.childId)
    .eq('date_type', 'birthday')
    .maybeSingle();

  const importantDateRow = {
    family_id: input.familyId,
    child_id: input.childId,
    label: `${label} birthday`,
    date_type: 'birthday' as const,
    gregorian_date: input.dateOfBirth,
    hebrew_date: result.english,
    hebrew_year: result.hebrewYear,
    notes,
  };

  let importantDateId = existingDate?.id ?? null;

  if (existingDate?.id) {
    const { error } = await supabase
      .from('important_dates')
      .update(importantDateRow)
      .eq('id', existingDate.id);

    if (error) {
      console.error('[hebrew-birthday] important_dates update failed:', error.message);
    } else {
      importantDateId = existingDate.id;
    }
  } else {
    const { data: inserted, error } = await supabase
      .from('important_dates')
      .insert(importantDateRow)
      .select('id')
      .single();

    if (error) {
      console.error('[hebrew-birthday] important_dates insert failed:', error.message);
    } else {
      importantDateId = inserted?.id ?? null;
    }
  }

  if (importantDateId) {
    void syncImportantDateToSheet({
      id: importantDateId,
      dateType: 'birthday',
      label: importantDateRow.label,
      gregorianDate: importantDateRow.gregorian_date,
      hebrewDate: importantDateRow.hebrew_date,
      hebrewYear: importantDateRow.hebrew_year,
      notes: importantDateRow.notes,
      familyId: importantDateRow.family_id,
      childId: importantDateRow.child_id,
    });
  }

  return { success: true, result };
}
