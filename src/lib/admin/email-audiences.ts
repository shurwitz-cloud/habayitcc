import { createAdminClient } from '@/lib/supabase/server';
import type { Parent, Program, ProgramRegistration } from '@/types/database';

export interface EmailAudienceSummary {
  id: string;
  label: string;
  description: string;
  recipientCount: number;
}

export interface EmailAudienceRecipient {
  email: string;
  firstName: string;
  lastName: string;
}

type AudienceData = {
  summaries: EmailAudienceSummary[];
  recipientsById: Map<string, EmailAudienceRecipient[]>;
};

function normalizeEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/**
 * Program audiences are built from current CRM registrations.
 * Withdrawn registrations are excluded; duplicate parent emails are collapsed.
 */
async function loadProgramAudiences(): Promise<AudienceData> {
  const supabase = createAdminClient();
  const [programsResult, registrationsResult, parentsResult] = await Promise.all([
    supabase.from('programs').select('*').order('name'),
    supabase.from('program_registrations').select('*').neq('status', 'withdrawn'),
    supabase.from('parents').select('*'),
  ]);

  const error =
    programsResult.error ?? registrationsResult.error ?? parentsResult.error;
  if (error) throw new Error(error.message);

  const programs = (programsResult.data ?? []) as Program[];
  const registrations = (registrationsResult.data ?? []) as ProgramRegistration[];
  const parents = (parentsResult.data ?? []) as Parent[];

  const familyIdsByProgram = new Map<string, Set<string>>();
  for (const registration of registrations) {
    const familyIds = familyIdsByProgram.get(registration.program_id) ?? new Set<string>();
    familyIds.add(registration.family_id);
    familyIdsByProgram.set(registration.program_id, familyIds);
  }

  const parentsByFamily = new Map<string, Parent[]>();
  for (const parent of parents) {
    const rows = parentsByFamily.get(parent.family_id) ?? [];
    rows.push(parent);
    parentsByFamily.set(parent.family_id, rows);
  }

  const recipientsById = new Map<string, EmailAudienceRecipient[]>();
  const summaries: EmailAudienceSummary[] = [];

  for (const program of programs) {
    const familyIds = familyIdsByProgram.get(program.id);
    if (!familyIds?.size) continue;

    const byEmail = new Map<string, EmailAudienceRecipient>();
    for (const familyId of familyIds) {
      for (const parent of parentsByFamily.get(familyId) ?? []) {
        const email = normalizeEmail(parent.email);
        if (!email || byEmail.has(email)) continue;
        byEmail.set(email, {
          email,
          firstName: parent.first_name?.trim() || '',
          lastName: parent.last_name?.trim() || '',
        });
      }
    }

    const id = `program:${program.id}`;
    const recipients = [...byEmail.values()].sort((a, b) =>
      a.email.localeCompare(b.email),
    );
    recipientsById.set(id, recipients);
    summaries.push({
      id,
      label: program.name,
      description: `${familyIds.size} registered ${familyIds.size === 1 ? 'family' : 'families'} · pending, accepted, and active`,
      recipientCount: recipients.length,
    });
  }

  return {
    summaries: summaries.sort((a, b) => a.label.localeCompare(b.label)),
    recipientsById,
  };
}

export async function listEmailAudiences(): Promise<EmailAudienceSummary[]> {
  return (await loadProgramAudiences()).summaries;
}

export async function resolveEmailAudience(
  audienceId: string,
): Promise<{ summary: EmailAudienceSummary; recipients: EmailAudienceRecipient[] } | null> {
  const data = await loadProgramAudiences();
  const summary = data.summaries.find((item) => item.id === audienceId);
  const recipients = data.recipientsById.get(audienceId);
  return summary && recipients ? { summary, recipients } : null;
}
