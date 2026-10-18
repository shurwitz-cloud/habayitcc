import { cache } from 'react';
import { isAdminAuthenticated } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/server';
import type { Child, ClassRoster, ClassSession, LearningProgress } from '@/types/database';
import { rosterCoversDate, todayIso } from './dates';
import { classKeyForGrade, getAttendanceProgram, type AttendanceProgram } from './programs';
import type {
  AttendanceChild,
  AttendanceFailure,
  AttendanceMarkRecord,
  AttendanceResult,
  AttendanceSnapshot,
  ChildSearchHit,
  ClassMarkInput,
  ProgressTrack,
  RosterEntry,
  RosterStatus,
  UnplacedChild,
} from './types';

const MIGRATION_HINT =
  'Attendance is not in the database yet. Open Supabase → SQL Editor, run supabase/migrations/0019_class_attendance.sql, then reload.';

function isMissingSchema(message: string): boolean {
  return /class_rosters|class_sessions|learning_progress|behavior_note|class_session_id|schema cache|does not exist|Could not find the/i.test(
    message,
  );
}

function fail(error: { message?: string } | null, fallback: string): AttendanceFailure {
  const message = error?.message ?? fallback;
  const migration = isMissingSchema(message);
  console.error('[attendance]', message);
  return { ok: false, migration, error: migration ? MIGRATION_HINT : fallback };
}

function clip(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function childName(child: { first_name: string; last_name: string }): string {
  return `${child.first_name} ${child.last_name}`.trim();
}

async function requireStaff(): Promise<AttendanceFailure | null> {
  if (await isAdminAuthenticated()) return null;
  return { ok: false, error: 'Sign in required.', migration: false };
}

function mapRoster(row: ClassRoster): RosterEntry {
  return {
    id: row.id,
    classKey: row.class_key,
    childId: row.child_id,
    status: row.status,
    joinedOn: row.joined_on,
    removedOn: row.removed_on,
  };
}

function mapChild(row: Pick<Child, 'id' | 'first_name' | 'last_name' | 'grade' | 'hebrew_level'>): AttendanceChild {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    grade: row.grade,
    hebrewLevel: row.hebrew_level,
  };
}

async function syncEnrolledRoster(
  program: AttendanceProgram,
): Promise<AttendanceFailure | { joinedByChild: Map<string, string> } | null> {
  const supabase = createAdminClient();
  const programRow = await supabase.from('programs').select('id').eq('slug', program.slug).maybeSingle();
  if (programRow.error) return fail(programRow.error, 'Could not load the program.');
  if (!programRow.data) return { joinedByChild: new Map() };

  const regs = await supabase
    .from('program_registrations')
    .select('child_id, status, created_at')
    .eq('program_id', programRow.data.id);
  if (regs.error) return fail(regs.error, 'Could not load enrollments.');

  const joinedByChild = new Map<string, string>();
  for (const reg of regs.data ?? []) {
    if (reg.status !== 'accepted' && reg.status !== 'active') continue;
    const day = reg.created_at.slice(0, 10);
    const prev = joinedByChild.get(reg.child_id);
    if (!prev || day < prev) joinedByChild.set(reg.child_id, day);
  }

  const roster = await supabase.from('class_rosters').select('*').eq('program_slug', program.slug);
  if (roster.error) return fail(roster.error, 'Could not load class lists.');

  const activeRows = (roster.data ?? []).filter((row) => !row.removed_on);
  const activeChildIds = new Set(activeRows.map((row) => row.child_id));

  const childIds = [...joinedByChild.keys()];
  const grades = new Map<string, string | null>();
  if (childIds.length > 0) {
    const kids = await supabase.from('children').select('id, grade').in('id', childIds);
    if (kids.error) return fail(kids.error, 'Could not load children.');
    for (const kid of kids.data ?? []) grades.set(kid.id, kid.grade);
  }

  const inserts: {
    program_slug: string;
    class_key: string;
    child_id: string;
    status: RosterStatus;
    joined_on: string;
    removed_on: null;
  }[] = [];
  for (const [childId, joinedOn] of joinedByChild) {
    if (activeChildIds.has(childId)) continue;
    const classKey = classKeyForGrade(program, grades.get(childId));
    if (!classKey) continue;
    inserts.push({
      program_slug: program.slug,
      class_key: classKey,
      child_id: childId,
      status: 'enrolled',
      joined_on: joinedOn,
      removed_on: null,
    });
  }
  if (inserts.length > 0) {
    const inserted = await supabase.from('class_rosters').insert(inserts);
    if (inserted.error && inserted.error.code !== '23505') {
      return fail(inserted.error, 'Could not place enrolled children in their classes.');
    }
  }

  const today = todayIso();
  for (const row of activeRows) {
    if (row.status !== 'enrolled') continue;
    if (joinedByChild.has(row.child_id)) continue;
    const updated = await supabase.from('class_rosters').update({ removed_on: today }).eq('id', row.id);
    if (updated.error) return fail(updated.error, 'Could not update a class list.');
  }

  return { joinedByChild };
}

async function loadSnapshot(programSlug: string): Promise<AttendanceResult<AttendanceSnapshot>> {
  const denied = await requireStaff();
  if (denied) return denied;

  const program = getAttendanceProgram(programSlug);
  if (!program) return { ok: false, error: 'Unknown program.', migration: false };

  const synced = await syncEnrolledRoster(program);
  if (synced && 'ok' in synced) return synced;

  const supabase = createAdminClient();
  const rosterRes = await supabase
    .from('class_rosters')
    .select('*')
    .eq('program_slug', program.slug)
    .order('joined_on', { ascending: true });
  if (rosterRes.error) return fail(rosterRes.error, 'Could not load class lists.');

  const roster = (rosterRes.data ?? []).map(mapRoster);
  const joinedByChild = synced?.joinedByChild ?? new Map<string, string>();
  const activeIds = new Set(roster.filter((row) => !row.removedOn).map((row) => row.childId));
  const unplacedIds = [...joinedByChild.keys()].filter((id) => !activeIds.has(id));
  const childIds = [...new Set([...roster.map((row) => row.childId), ...unplacedIds])];

  let childRows: Pick<Child, 'id' | 'first_name' | 'last_name' | 'grade' | 'hebrew_level'>[] = [];
  if (childIds.length > 0) {
    const kids = await supabase
      .from('children')
      .select('id, first_name, last_name, grade, hebrew_level')
      .in('id', childIds);
    if (kids.error) return fail(kids.error, 'Could not load children.');
    childRows = kids.data ?? [];
  }
  const children = childRows.map(mapChild);
  const byId = new Map(children.map((child) => [child.id, child]));

  const unplaced: UnplacedChild[] = unplacedIds.flatMap((childId) => {
    const child = byId.get(childId);
    if (!child) return [];
    return [
      {
        childId,
        firstName: child.firstName,
        lastName: child.lastName,
        grade: child.grade,
        joinedOn: joinedByChild.get(childId) ?? todayIso(),
      },
    ];
  });

  const sessionsRes = await supabase
    .from('class_sessions')
    .select('*')
    .eq('program_slug', program.slug)
    .order('session_date', { ascending: false });
  if (sessionsRes.error) return fail(sessionsRes.error, 'Could not load Sundays.');
  const sessionRows = (sessionsRes.data ?? []) as ClassSession[];
  const sessions = sessionRows.map((row) => ({
    id: row.id,
    classKey: row.class_key,
    sessionDate: row.session_date,
  }));
  const sessionById = new Map(sessionRows.map((row) => [row.id, row]));

  let marks: AttendanceMarkRecord[] = [];
  const sessionIds = sessions.map((session) => session.id);
  if (sessionIds.length > 0) {
    const marksRes = await supabase
      .from('attendance')
      .select('id, child_id, class_session_id, was_present, behavior_note, participation_note')
      .in('class_session_id', sessionIds);
    if (marksRes.error) return fail(marksRes.error, 'Could not load attendance.');
    marks = (marksRes.data ?? []).flatMap((row) => {
      if (!row.child_id || !row.class_session_id) return [];
      const session = sessionById.get(row.class_session_id);
      if (!session) return [];
      return [
        {
          id: row.id,
          childId: row.child_id,
          classKey: session.class_key,
          sessionDate: session.session_date,
          wasPresent: row.was_present,
          behaviorNote: row.behavior_note,
          participationNote: row.participation_note,
        },
      ];
    });
  }

  let progress: AttendanceSnapshot['progress'] = [];
  if (childIds.length > 0) {
    const progressRes = await supabase
      .from('learning_progress')
      .select('*')
      .eq('program_slug', program.slug)
      .in('child_id', childIds)
      .order('recorded_on', { ascending: false })
      .order('created_at', { ascending: false });
    if (progressRes.error) return fail(progressRes.error, 'Could not load Torah and Hebrew reading notes.');
    progress = ((progressRes.data ?? []) as LearningProgress[]).map((row) => ({
      id: row.id,
      childId: row.child_id,
      track: row.track,
      standing: row.standing,
      note: row.note,
      recordedOn: row.recorded_on,
    }));
  }

  return {
    ok: true,
    data: { programSlug: program.slug, roster, children, sessions, marks, progress, unplaced },
  };
}

export const getAttendanceSnapshot = cache(loadSnapshot);

export async function searchChildren(query: string): Promise<AttendanceResult<ChildSearchHit[]>> {
  const denied = await requireStaff();
  if (denied) return denied;
  const q = clip(query, 80);
  if (q.length < 2) return { ok: true, data: [] };

  const supabase = createAdminClient();
  const parts = q.split(/\s+/).filter(Boolean);
  const request =
    parts.length >= 2
      ? supabase
          .from('children')
          .select('id, first_name, last_name, grade')
          .ilike('first_name', `%${parts[0].replace(/[%_]/g, '')}%`)
          .ilike('last_name', `%${parts.slice(1).join(' ').replace(/[%_]/g, '')}%`)
      : supabase
          .from('children')
          .select('id, first_name, last_name, grade')
          .or(
            `first_name.ilike.%${q.replace(/[%_,]/g, '')}%,last_name.ilike.%${q.replace(/[%_,]/g, '')}%`,
          );

  const result = await request.limit(8);
  if (result.error) return fail(result.error, 'Could not search children.');
  return {
    ok: true,
    data: (result.data ?? []).map((row) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      grade: row.grade,
    })),
  };
}

async function activeRoster(programSlug: string, childId: string): Promise<ClassRoster | null> {
  const supabase = createAdminClient();
  const result = await supabase
    .from('class_rosters')
    .select('*')
    .eq('program_slug', programSlug)
    .eq('child_id', childId)
    .is('removed_on', null)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export async function placeEnrolledChild(
  programSlug: string,
  classKey: string,
  childId: string,
): Promise<AttendanceFailure | { ok: true }> {
  const denied = await requireStaff();
  if (denied) return denied;
  const program = getAttendanceProgram(programSlug);
  if (!program || !program.classes.some((entry) => entry.key === classKey)) {
    return { ok: false, error: 'Unknown class.', migration: false };
  }

  const supabase = createAdminClient();
  const child = await supabase.from('children').select('id, first_name, last_name').eq('id', childId).maybeSingle();
  if (child.error || !child.data) return fail(child.error, 'That child was not found.');

  let existing: ClassRoster | null = null;
  try {
    existing = await activeRoster(programSlug, childId);
  } catch (err) {
    return fail(err instanceof Error ? err : null, 'Could not check the class list.');
  }
  if (existing) {
    const label = program.classes.find((entry) => entry.key === existing.class_key)?.label ?? 'another class';
    return { ok: false, error: `${childName(child.data)} is already in ${label}.`, migration: false };
  }

  const inserted = await supabase.from('class_rosters').insert({
    program_slug: programSlug,
    class_key: classKey,
    child_id: childId,
    status: 'enrolled',
    joined_on: todayIso(),
    removed_on: null,
  });
  if (inserted.error) return fail(inserted.error, 'Could not add this child to the class.');
  return { ok: true };
}

export async function addTryoutChild(input: {
  programSlug: string;
  classKey: string;
  firstName: string;
  lastName: string;
  grade: string;
}): Promise<AttendanceFailure | { ok: true }> {
  const denied = await requireStaff();
  if (denied) return denied;
  const program = getAttendanceProgram(input.programSlug);
  const classDef = program?.classes.find((entry) => entry.key === input.classKey);
  if (!program || !classDef) return { ok: false, error: 'Unknown class.', migration: false };

  const firstName = clip(input.firstName, 80);
  const lastName = clip(input.lastName, 80);
  const grade = clip(input.grade, 20);
  if (!firstName || !lastName) return { ok: false, error: 'Enter a first and last name.', migration: false };
  if (!classDef.grades.includes(grade)) return { ok: false, error: 'Pick a grade for this class.', migration: false };

  const supabase = createAdminClient();
  const family = await supabase
    .from('families')
    .insert({
      family_name: lastName,
      street_address: null,
      city: null,
      state: null,
      zip: null,
      notes: `${program.name} tryout`,
      emergency_contact_name: null,
      emergency_contact_phone: null,
      stripe_customer_id: null,
      stripe_payment_method_id: null,
      payment_method_preference: null,
    })
    .select('id')
    .single();
  if (family.error || !family.data) return fail(family.error, 'Could not add this tryout.');

  const child = await supabase
    .from('children')
    .insert({
      family_id: family.data.id,
      first_name: firstName,
      last_name: lastName,
      hebrew_name: null,
      date_of_birth: null,
      born_before_sunset: null,
      born_sunset_timing: null,
      hebrew_birthday: null,
      hebrew_birthday_hebrew: null,
      hebrew_birthday_year: null,
      grade,
      school_attending: null,
      attended_before: null,
      hebrew_level: null,
      allergies: null,
      medications: null,
      notes: null,
    })
    .select('id')
    .single();
  if (child.error || !child.data) {
    await supabase.from('families').delete().eq('id', family.data.id);
    return fail(child.error, 'Could not add this tryout.');
  }

  const roster = await supabase.from('class_rosters').insert({
    program_slug: program.slug,
    class_key: classDef.key,
    child_id: child.data.id,
    status: 'tryout',
    joined_on: todayIso(),
    removed_on: null,
  });
  if (roster.error) return fail(roster.error, 'Could not put this tryout in the class.');
  return { ok: true };
}

export async function addExistingTryout(
  programSlug: string,
  classKey: string,
  childId: string,
): Promise<AttendanceFailure | { ok: true }> {
  const denied = await requireStaff();
  if (denied) return denied;
  const program = getAttendanceProgram(programSlug);
  const classDef = program?.classes.find((entry) => entry.key === classKey);
  if (!program || !classDef) return { ok: false, error: 'Unknown class.', migration: false };

  const supabase = createAdminClient();
  const child = await supabase.from('children').select('id, first_name, last_name').eq('id', childId).maybeSingle();
  if (child.error || !child.data) return fail(child.error, 'That child was not found.');

  let existing: ClassRoster | null = null;
  try {
    existing = await activeRoster(programSlug, childId);
  } catch (err) {
    return fail(err instanceof Error ? err : null, 'Could not check the class list.');
  }

  if (existing?.class_key === classKey) {
    return { ok: false, error: `${childName(child.data)} is already in this class.`, migration: false };
  }
  if (existing?.status === 'enrolled') {
    const label = program.classes.find((entry) => entry.key === existing.class_key)?.label ?? 'another class';
    return {
      ok: false,
      error: `${childName(child.data)} is enrolled in ${label}.`,
      migration: false,
    };
  }
  if (existing?.status === 'tryout') {
    const closed = await supabase.from('class_rosters').update({ removed_on: todayIso() }).eq('id', existing.id);
    if (closed.error) return fail(closed.error, 'Could not move this tryout.');
  }

  const inserted = await supabase.from('class_rosters').insert({
    program_slug: programSlug,
    class_key: classKey,
    child_id: childId,
    status: 'tryout',
    joined_on: todayIso(),
    removed_on: null,
  });
  if (inserted.error) return fail(inserted.error, 'Could not add this child.');
  return { ok: true };
}

export async function removeTryout(rosterId: string): Promise<AttendanceFailure | { ok: true }> {
  const denied = await requireStaff();
  if (denied) return denied;
  const supabase = createAdminClient();
  const row = await supabase.from('class_rosters').select('*').eq('id', rosterId).maybeSingle();
  if (row.error || !row.data) return fail(row.error, 'That class list entry was not found.');
  if (row.data.status !== 'tryout') {
    return {
      ok: false,
      error: 'Enrolled children stay on the class list until their registration is withdrawn.',
      migration: false,
    };
  }
  if (row.data.removed_on) return { ok: true };
  const updated = await supabase.from('class_rosters').update({ removed_on: todayIso() }).eq('id', row.data.id);
  if (updated.error) return fail(updated.error, 'Could not remove this tryout.');
  return { ok: true };
}

export async function saveClassMarks(input: {
  programSlug: string;
  classKey: string;
  sessionDate: string;
  marks: ClassMarkInput[];
}): Promise<AttendanceFailure | { ok: true }> {
  const denied = await requireStaff();
  if (denied) return denied;
  const program = getAttendanceProgram(input.programSlug);
  if (!program || !program.classes.some((entry) => entry.key === input.classKey)) {
    return { ok: false, error: 'Unknown class.', migration: false };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.sessionDate)) {
    return { ok: false, error: 'Pick a Sunday.', migration: false };
  }

  const supabase = createAdminClient();
  const rosterRes = await supabase
    .from('class_rosters')
    .select('*')
    .eq('program_slug', input.programSlug)
    .eq('class_key', input.classKey);
  if (rosterRes.error) return fail(rosterRes.error, 'Could not load this class.');

  const allowed = new Set(
    (rosterRes.data ?? [])
      .filter((row) => rosterCoversDate(row.joined_on, row.removed_on, input.sessionDate))
      .map((row) => row.child_id),
  );

  let sessionId: string;
  const existingSession = await supabase
    .from('class_sessions')
    .select('id')
    .eq('program_slug', input.programSlug)
    .eq('class_key', input.classKey)
    .eq('session_date', input.sessionDate)
    .maybeSingle();
  if (existingSession.error) return fail(existingSession.error, 'Could not open this Sunday.');
  if (existingSession.data) {
    sessionId = existingSession.data.id;
  } else {
    const created = await supabase
      .from('class_sessions')
      .insert({
        program_slug: input.programSlug,
        class_key: input.classKey,
        session_date: input.sessionDate,
      })
      .select('id')
      .single();
    if (created.error || !created.data) {
      const again = await supabase
        .from('class_sessions')
        .select('id')
        .eq('program_slug', input.programSlug)
        .eq('class_key', input.classKey)
        .eq('session_date', input.sessionDate)
        .maybeSingle();
      if (!again.data) return fail(created.error, 'Could not open this Sunday.');
      sessionId = again.data.id;
    } else {
      sessionId = created.data.id;
    }
  }

  const current = await supabase
    .from('attendance')
    .select('id, child_id')
    .eq('class_session_id', sessionId);
  if (current.error) return fail(current.error, 'Could not load this Sunday.');
  const currentByChild = new Map(
    (current.data ?? []).flatMap((row) => (row.child_id ? [[row.child_id, row.id] as const] : [])),
  );

  const inserts: {
    program_registration_id: null;
    event_registration_id: null;
    child_id: string;
    class_session_id: string;
    attended_on: string;
    was_present: boolean | null;
    behavior_note: string | null;
    participation_note: string | null;
    notes: null;
  }[] = [];
  const updates: { id: string; was_present: boolean | null; behavior_note: string | null; participation_note: string | null }[] = [];
  const deleteIds: string[] = [];

  for (const mark of input.marks) {
    if (!allowed.has(mark.childId)) continue;
    const behavior = clip(mark.behaviorNote, 2000) || null;
    const participation = clip(mark.participationNote, 2000) || null;
    const wasPresent = mark.wasPresent === true ? true : mark.wasPresent === false ? false : null;
    const keep = wasPresent !== null || behavior || participation;
    const existingId = currentByChild.get(mark.childId);
    if (!keep) {
      if (existingId) deleteIds.push(existingId);
      continue;
    }
    if (existingId) {
      updates.push({
        id: existingId,
        was_present: wasPresent,
        behavior_note: behavior,
        participation_note: participation,
      });
    } else {
      inserts.push({
        program_registration_id: null,
        event_registration_id: null,
        child_id: mark.childId,
        class_session_id: sessionId,
        attended_on: input.sessionDate,
        was_present: wasPresent,
        behavior_note: behavior,
        participation_note: participation,
        notes: null,
      });
    }
  }

  if (inserts.length > 0) {
    const inserted = await supabase.from('attendance').insert(inserts);
    if (inserted.error) return fail(inserted.error, 'Could not save attendance.');
  }
  for (const update of updates) {
    const updated = await supabase
      .from('attendance')
      .update({
        was_present: update.was_present,
        behavior_note: update.behavior_note,
        participation_note: update.participation_note,
        attended_on: input.sessionDate,
      })
      .eq('id', update.id);
    if (updated.error) return fail(updated.error, 'Could not save attendance.');
  }
  if (deleteIds.length > 0) {
    const deleted = await supabase.from('attendance').delete().in('id', deleteIds);
    if (deleted.error) return fail(deleted.error, 'Could not save attendance.');
  }

  const remaining = await supabase
    .from('attendance')
    .select('id', { count: 'exact', head: true })
    .eq('class_session_id', sessionId);
  if (!remaining.error && (remaining.count ?? 0) === 0) {
    await supabase.from('class_sessions').delete().eq('id', sessionId);
  }

  return { ok: true };
}

export async function addLearningProgress(input: {
  programSlug: string;
  childId: string;
  track: ProgressTrack;
  standing: string;
  note: string;
  recordedOn: string;
}): Promise<AttendanceFailure | { ok: true }> {
  const denied = await requireStaff();
  if (denied) return denied;
  if (!getAttendanceProgram(input.programSlug)) {
    return { ok: false, error: 'Unknown program.', migration: false };
  }
  if (input.track !== 'torah' && input.track !== 'hebrew_reading') {
    return { ok: false, error: 'Unknown progress note.', migration: false };
  }
  const standing = clip(input.standing, 200);
  if (!standing) return { ok: false, error: 'Write where they are now.', migration: false };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.recordedOn)) {
    return { ok: false, error: 'Pick a date.', migration: false };
  }

  const supabase = createAdminClient();
  const onRoster = await supabase
    .from('class_rosters')
    .select('id')
    .eq('program_slug', input.programSlug)
    .eq('child_id', input.childId)
    .limit(1);
  if (onRoster.error) return fail(onRoster.error, 'Could not save this note.');
  if (!onRoster.data?.length) {
    return { ok: false, error: 'This child is not on a class list.', migration: false };
  }

  const inserted = await supabase.from('learning_progress').insert({
    child_id: input.childId,
    program_slug: input.programSlug,
    track: input.track,
    standing,
    note: clip(input.note, 2000) || null,
    recorded_on: input.recordedOn,
  });
  if (inserted.error) return fail(inserted.error, 'Could not save this note.');
  return { ok: true };
}
