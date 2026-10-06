import { createAdminClient } from '@/lib/supabase/server';
import type {
  FormSubmission,
  Parent,
  Program,
  ProgramRegistration,
} from '@/types/database';

const OVERRIDE_FORM_TYPE = 'email_group_override';

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
  source: 'registration' | 'manual';
}

type AudienceData = {
  summaries: EmailAudienceSummary[];
  recipientsById: Map<string, EmailAudienceRecipient[]>;
};

export function normalizeAudienceEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function programIdFromAudienceId(audienceId: string): string | null {
  if (!audienceId.startsWith('program:')) return null;
  const programId = audienceId.slice('program:'.length).trim();
  return programId || null;
}

/**
 * Program audiences are built from current CRM registrations.
 * Withdrawn registrations are excluded; duplicate parent emails are collapsed.
 */
async function loadProgramAudiences(): Promise<AudienceData> {
  const supabase = createAdminClient();
  const [programsResult, registrationsResult, parentsResult, overridesResult] = await Promise.all([
    supabase.from('programs').select('*').order('name'),
    supabase.from('program_registrations').select('*').neq('status', 'withdrawn'),
    supabase.from('parents').select('*'),
    supabase
      .from('form_submissions')
      .select('*')
      .eq('form_type', OVERRIDE_FORM_TYPE)
      .order('created_at', { ascending: true }),
  ]);

  const error =
    programsResult.error ??
    registrationsResult.error ??
    parentsResult.error ??
    overridesResult.error;
  if (error) throw new Error(error.message);

  const programs = (programsResult.data ?? []) as Program[];
  const registrations = (registrationsResult.data ?? []) as ProgramRegistration[];
  const parents = (parentsResult.data ?? []) as Parent[];
  const overrideRows = (overridesResult.data ?? []) as FormSubmission[];

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
  const overridesByProgram = new Map<string, Map<string, FormSubmission>>();
  for (const override of overrideRows) {
    const programId = override.source_id;
    const email = normalizeAudienceEmail(override.email);
    if (!programId || !email) continue;
    const rows = overridesByProgram.get(programId) ?? new Map<string, FormSubmission>();
    // Rows are oldest first, so the last action for an address wins.
    rows.set(email, override);
    overridesByProgram.set(programId, rows);
  }

  for (const program of programs) {
    const familyIds = familyIdsByProgram.get(program.id) ?? new Set<string>();

    const byEmail = new Map<string, EmailAudienceRecipient>();
    for (const familyId of familyIds) {
      for (const parent of parentsByFamily.get(familyId) ?? []) {
        const email = normalizeAudienceEmail(parent.email);
        if (!email || byEmail.has(email)) continue;
        byEmail.set(email, {
          email,
          firstName: parent.first_name?.trim() || '',
          lastName: parent.last_name?.trim() || '',
          source: 'registration',
        });
      }
    }

    let manualIncludes = 0;
    let manualExcludes = 0;
    for (const override of overridesByProgram.get(program.id)?.values() ?? []) {
      const email = normalizeAudienceEmail(override.email);
      if (!email) continue;
      const action = override.payload.action;
      if (action === 'exclude') {
        if (byEmail.delete(email)) manualExcludes += 1;
        continue;
      }
      if (action !== 'include') continue;
      byEmail.set(email, {
        email,
        firstName:
          typeof override.payload.first_name === 'string'
            ? override.payload.first_name.trim()
            : '',
        lastName:
          typeof override.payload.last_name === 'string'
            ? override.payload.last_name.trim()
            : '',
        source: 'manual',
      });
      manualIncludes += 1;
    }

    if (!familyIds.size && !byEmail.size && program.is_active === false) continue;

    const id = `program:${program.id}`;
    const recipients = [...byEmail.values()].sort((a, b) =>
      a.email.localeCompare(b.email),
    );
    recipientsById.set(id, recipients);
    summaries.push({
      id,
      label: program.name,
      description: [
        `${familyIds.size} registered ${familyIds.size === 1 ? 'family' : 'families'}`,
        manualIncludes ? `${manualIncludes} manually added` : '',
        manualExcludes ? `${manualExcludes} removed` : '',
        'pending, accepted, and active',
      ].filter(Boolean).join(' · '),
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

export async function setEmailAudienceOverride(input: {
  audienceId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  action: 'include' | 'exclude';
}): Promise<void> {
  const programId = programIdFromAudienceId(input.audienceId);
  const email = normalizeAudienceEmail(input.email);
  if (!programId || !email) throw new Error('Invalid program group or email address.');

  const supabase = createAdminClient();
  const { data: program, error: programError } = await supabase
    .from('programs')
    .select('id')
    .eq('id', programId)
    .maybeSingle();
  if (programError || !program) {
    throw new Error(programError?.message || 'Program group not found.');
  }

  const { error } = await supabase.from('form_submissions').insert({
    form_type: OVERRIDE_FORM_TYPE,
    source_id: programId,
    email,
    payload: {
      action: input.action,
      first_name: input.firstName?.trim() || null,
      last_name: input.lastName?.trim() || null,
    },
  });
  if (error) throw new Error(error.message);
}
