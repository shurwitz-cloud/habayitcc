'use server';

import { revalidatePath } from 'next/cache';
import {
  addExistingTryout,
  addLearningProgress,
  addTryoutChild,
  placeEnrolledChild,
  removeTryout,
  saveClassMarks,
  searchChildren,
} from '@/lib/attendance/data';
import type { ClassMarkInput, ProgressTrack } from '@/lib/attendance/types';

function refreshAttendance() {
  revalidatePath('/app', 'layout');
  revalidatePath('/admin/attendance');
}

export async function saveClassAttendanceAction(input: {
  programSlug: string;
  classKey: string;
  sessionDate: string;
  marks: ClassMarkInput[];
}) {
  const result = await saveClassMarks(input);
  if (result.ok) refreshAttendance();
  return result;
}

export async function addTryoutAction(input: {
  programSlug: string;
  classKey: string;
  firstName: string;
  lastName: string;
  grade: string;
}) {
  const result = await addTryoutChild(input);
  if (result.ok) refreshAttendance();
  return result;
}

export async function addExistingTryoutAction(programSlug: string, classKey: string, childId: string) {
  const result = await addExistingTryout(programSlug, classKey, childId);
  if (result.ok) refreshAttendance();
  return result;
}

export async function placeChildAction(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const result = await placeEnrolledChild(
    String(formData.get('programSlug') ?? ''),
    String(formData.get('classKey') ?? ''),
    String(formData.get('childId') ?? ''),
  );
  if (result.ok) {
    refreshAttendance();
    return null;
  }
  return { error: result.error };
}

export async function removeTryoutAction(rosterId: string) {
  const result = await removeTryout(rosterId);
  if (result.ok) refreshAttendance();
  return result;
}

export async function addProgressAction(input: {
  programSlug: string;
  childId: string;
  track: ProgressTrack;
  standing: string;
  note: string;
  recordedOn: string;
}) {
  const result = await addLearningProgress(input);
  if (result.ok) refreshAttendance();
  return result;
}

export async function searchChildrenAction(query: string) {
  return searchChildren(query);
}
