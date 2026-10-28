export type RosterStatus = 'enrolled' | 'tryout';
export type ProgressTrack = 'torah' | 'hebrew_reading';

export type RosterEntry = {
  id: string;
  classKey: string;
  childId: string;
  status: RosterStatus;
  joinedOn: string;
  removedOn: string | null;
};

export type AttendanceChild = {
  id: string;
  firstName: string;
  lastName: string;
  hebrewName: string | null;
  grade: string | null;
  hebrewLevel: string | null;
};

export type ClassSessionRecord = {
  id: string;
  classKey: string;
  sessionDate: string;
};

export type AttendanceMarkRecord = {
  id: string;
  childId: string;
  classKey: string;
  sessionDate: string;
  wasPresent: boolean | null;
  behaviorNote: string | null;
  participationNote: string | null;
  hebrewNote: string | null;
};

export type ProgressRecord = {
  id: string;
  childId: string;
  track: ProgressTrack;
  standing: string;
  note: string | null;
  recordedOn: string;
};

export type UnplacedChild = {
  childId: string;
  firstName: string;
  lastName: string;
  grade: string | null;
  joinedOn: string;
};

export type AttendanceSnapshot = {
  programSlug: string;
  roster: RosterEntry[];
  children: AttendanceChild[];
  sessions: ClassSessionRecord[];
  marks: AttendanceMarkRecord[];
  progress: ProgressRecord[];
  unplaced: UnplacedChild[];
};

export type AttendanceFailure = {
  ok: false;
  error: string;
  migration: boolean;
};

export type AttendanceResult<T> = { ok: true; data: T } | AttendanceFailure;

export type ChildSearchHit = {
  id: string;
  firstName: string;
  lastName: string;
  grade: string | null;
};

export type ClassMarkInput = {
  childId: string;
  wasPresent: boolean | null;
  behaviorNote: string;
  participationNote: string;
  hebrewNote: string;
};
