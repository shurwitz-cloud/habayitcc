import { ACHIM_SLUG, BMX_SLUG, BLOOM_SLUG, HEBREW_ADVENTURE_SLUG } from '@/lib/programs/names';

export type AttendanceClass = {
  key: string;
  label: string;
  grades: string[];
};

export type AttendanceProgram = {
  slug: string;
  name: string;
  /** 0 = Sunday … 6 = Saturday. Session dates snap to this weekday. */
  meetingWeekday: number;
  classes: AttendanceClass[];
};

export const ATTENDANCE_PROGRAMS: AttendanceProgram[] = [
  {
    slug: HEBREW_ADVENTURE_SLUG,
    name: 'Hebrew Adventure',
    meetingWeekday: 0,
    classes: [
      { key: 'k-1', label: 'K & 1st Grade', grades: ['K', '1st'] },
      { key: '2', label: '2nd Grade', grades: ['2nd'] },
      { key: '3-4', label: '3rd & 4th Grade', grades: ['3rd', '4th'] },
      { key: '5', label: '5th Grade', grades: ['5th'] },
    ],
  },
  {
    slug: ACHIM_SLUG,
    name: 'Achim',
    meetingWeekday: 2,
    classes: [{ key: '6', label: '6th Grade', grades: ['6th'] }],
  },
  {
    slug: BMX_SLUG,
    name: 'BMX',
    meetingWeekday: 4,
    classes: [{ key: '7', label: '7th Grade', grades: ['7th'] }],
  },
  {
    slug: BLOOM_SLUG,
    name: 'Bloom',
    meetingWeekday: 3,
    classes: [{ key: '6', label: '6th Grade', grades: ['6th'] }],
  },
];

const GRADE_ALIASES: Record<string, string> = {
  k: 'K',
  kindergarten: 'K',
  kinder: 'K',
  '1': '1st',
  '2': '2nd',
  '3': '3rd',
  '4': '4th',
  '5': '5th',
  '6': '6th',
  '7': '7th',
};

export function getAttendanceProgram(slug: string): AttendanceProgram | null {
  return ATTENDANCE_PROGRAMS.find((program) => program.slug === slug) ?? null;
}

export function getAttendanceClass(program: AttendanceProgram, classKey: string): AttendanceClass | null {
  return program.classes.find((entry) => entry.key === classKey) ?? null;
}

export function normalizeGrade(grade: string | null | undefined): string | null {
  const trimmed = grade?.trim();
  if (!trimmed) return null;
  return GRADE_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

export function classKeyForGrade(program: AttendanceProgram, grade: string | null | undefined): string | null {
  const normalized = normalizeGrade(grade);
  if (normalized) {
    const match = program.classes.find((entry) =>
      entry.grades.some((gradeName) => gradeName.toLowerCase() === normalized.toLowerCase()),
    );
    if (match) return match.key;
  }
  // Single-class programs (Achim, BMX, Bloom): place every enrolled child in the one class.
  if (program.classes.length === 1) return program.classes[0].key;
  return null;
}

export function weekdayLabel(weekday: number): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday] ?? 'day';
}
