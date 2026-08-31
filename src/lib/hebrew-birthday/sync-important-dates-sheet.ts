import { createAdminClient } from '@/lib/supabase/server';
import {
  syncAllImportantDatesToSheet,
  syncImportantDateToSheet,
} from '@/lib/google/important-dates-sheet';

export async function syncImportantDateRecordToSheet(importantDateId: string): Promise<void> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('important_dates')
    .select('*')
    .eq('id', importantDateId)
    .maybeSingle();

  if (error || !data) {
    console.error('[important-dates-sheet] record lookup failed:', error?.message);
    return;
  }

  await syncImportantDateToSheet({
    id: data.id,
    dateType: data.date_type,
    label: data.label,
    gregorianDate: data.gregorian_date,
    hebrewDate: data.hebrew_date,
    hebrewYear: data.hebrew_year,
    notes: data.notes,
    familyId: data.family_id,
    childId: data.child_id,
  });
}

export async function syncAllImportantDatesFromDb(): Promise<{ synced: number; skipped: number }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('important_dates')
    .select('*')
    .in('date_type', ['birthday', 'yahrzeit'])
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return syncAllImportantDatesToSheet(data ?? []);
}
