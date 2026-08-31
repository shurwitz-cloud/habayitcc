import { createAdminClient } from '@/lib/supabase/server';
import {
  lookupHebrewBirthday,
  type HebrewBirthdayResult,
  type SunsetTiming,
} from '@/lib/hebrew-birthday/hebcal-converter';
import { buildHebrewBirthdayNotes } from '@/lib/hebrew-birthday/notes';
import { syncImportantDateToSheet } from '@/lib/google/important-dates-sheet';

export interface BackfillHebrewBirthdayRow {
  id: string;
  family_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  born_before_sunset: boolean | null;
  born_sunset_timing: string | null;
  hebrew_birthday?: string | null;
}

export interface BackfillHebrewBirthdaysResult {
  processed: number;
  updated: number;
  skipped: number;
  failed: number;
  migrationRequired: boolean;
  results: Array<{
    childId: string;
    name: string;
    dateOfBirth: string;
    hebrewBirthday?: string;
    error?: string;
  }>;
}

async function upsertChildBirthdayImportantDate(input: {
  childId: string;
  familyId: string;
  label: string;
  dateOfBirth: string;
  bornSunsetTiming: string | null;
  result: HebrewBirthdayResult;
}) {
  const supabase = createAdminClient();
  const notes = buildHebrewBirthdayNotes(input.bornSunsetTiming as SunsetTiming);

  const { data: existingDate } = await supabase
    .from('important_dates')
    .select('id')
    .eq('child_id', input.childId)
    .eq('date_type', 'birthday')
    .maybeSingle();

  const importantDateRow = {
    family_id: input.familyId,
    child_id: input.childId,
    label: `${input.label} birthday`,
    date_type: 'birthday' as const,
    gregorian_date: input.dateOfBirth,
    hebrew_date: input.result.english,
    hebrew_year: input.result.hebrewYear,
    notes,
  };

  let importantDateId = existingDate?.id ?? null;

  if (existingDate?.id) {
    await supabase.from('important_dates').update(importantDateRow).eq('id', existingDate.id);
    importantDateId = existingDate.id;
  } else {
    const { data: inserted } = await supabase
      .from('important_dates')
      .insert(importantDateRow)
      .select('id')
      .single();
    importantDateId = inserted?.id ?? null;
  }

  if (importantDateId) {
    await syncImportantDateToSheet({
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
}

async function loadChildrenForBackfill(force: boolean): Promise<BackfillHebrewBirthdayRow[]> {
  const supabase = createAdminClient();

  const { data: children, error } = await supabase
    .from('children')
    .select(
      'id, family_id, first_name, last_name, date_of_birth, born_before_sunset, born_sunset_timing',
    )
    .not('date_of_birth', 'is', null)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (children ?? []) as BackfillHebrewBirthdayRow[];
  if (force || !rows.length) {
    return rows;
  }

  const { data: existingBirthdays, error: datesError } = await supabase
    .from('important_dates')
    .select('child_id, hebrew_date')
    .eq('date_type', 'birthday')
    .not('child_id', 'is', null);

  if (datesError) {
    throw new Error(datesError.message);
  }

  const doneChildIds = new Set(
    (existingBirthdays ?? [])
      .filter((row) => row.child_id && row.hebrew_date)
      .map((row) => row.child_id as string),
  );

  return rows.filter((child) => !doneChildIds.has(child.id));
}

export async function backfillHebrewBirthdays(options?: {
  force?: boolean;
  delayMs?: number;
}): Promise<BackfillHebrewBirthdaysResult> {
  const supabase = createAdminClient();
  const force = options?.force ?? false;
  const delayMs = options?.delayMs ?? 120;

  const rows = await loadChildrenForBackfill(force);
  const output: BackfillHebrewBirthdaysResult = {
    processed: rows.length,
    updated: 0,
    skipped: 0,
    failed: 0,
    migrationRequired: false,
    results: [],
  };

  if (!rows.length) {
    return output;
  }

  let childColumnsAvailable = true;

  for (const child of rows) {
    const name = `${child.first_name} ${child.last_name}`.trim();
    const dateOfBirth = child.date_of_birth;

    try {
      const result = await lookupHebrewBirthday({
        dateOfBirth,
        bornSunsetTiming: child.born_sunset_timing as SunsetTiming,
        bornBeforeSunset: child.born_before_sunset,
      });

      if (!result) {
        output.failed++;
        output.results.push({
          childId: child.id,
          name,
          dateOfBirth,
          error: 'Hebcal conversion failed',
        });
        await sleep(delayMs);
        continue;
      }

      if (childColumnsAvailable) {
        const { error: childError } = await supabase
          .from('children')
          .update({
            hebrew_birthday: result.english,
            hebrew_birthday_hebrew: result.hebrew,
            hebrew_birthday_year: result.hebrewYear,
          })
          .eq('id', child.id);

        if (childError) {
          if (/column .* does not exist|Could not find the .* column/i.test(childError.message)) {
            childColumnsAvailable = false;
            output.migrationRequired = true;
          } else {
            throw new Error(childError.message);
          }
        }
      }

      await upsertChildBirthdayImportantDate({
        childId: child.id,
        familyId: child.family_id,
        label: name,
        dateOfBirth,
        bornSunsetTiming: child.born_sunset_timing,
        result,
      });

      output.updated++;
      output.results.push({
        childId: child.id,
        name,
        dateOfBirth,
        hebrewBirthday: result.english,
      });
    } catch (err) {
      output.failed++;
      output.results.push({
        childId: child.id,
        name,
        dateOfBirth,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }

    await sleep(delayMs);
  }

  return output;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
