import { HEBREW_ADVENTURE_SLUG } from '@/lib/programs/names';

export type AttendanceClass = {
  key: string;
  label: string;
  grades: string[];
};

export type AttendanceProgram = {
  slug: string;
  name: string;
  classes: AttendanceClass[];
};

/**
 * Programs that use the attendance app.
 * Add BMX, Achim, or Bloom here with their own classes when those rolls open.
 */
export const ATTENDANCE_PROGRAMS: AttendanceProgram[] = [
  {
    slug: HEBREW_ADVENTURE_SLUG,
    name: 'Hebrew Adventure',
    classes: [
      { key: 'k-1', label: 'K & 1st Grade', grades: ['K', '1st'] },
      { key: '2', label: '2nd Grade', grades: ['2nd'] },
      { key: '3-4', label: '3rd & 4th Grade', grades: ['3rd', '4th'] },
      { key: '5', label: '5th Grade', grades: ['5th'] },
    ],
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
  if (!normalized) return null;
  const match = program.classes.find((entry) =>
    entry.grades.some((gradeName) => gradeName.toLowerCase() === normalized.toLowerCase()),
  );
  return match?.key ?? null;
}
