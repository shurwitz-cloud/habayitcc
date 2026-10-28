import { createAdminClient } from '@/lib/supabase/server';
import type {
  Contact,
  EmailGroupOverride,
  Parent,
  Program,
  ProgramRegistration,
} from '@/types/database';

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

export interface EmailAudienceOverride {
  email: string;
  firstName: string;
  lastName: string;
  action: 'include' | 'exclude';
}

export interface EmailAudienceContact {
  email: string;
  firstName: string;
  lastName: string;
  source: 'parent' | 'contact';
}

type AudienceData = {
  summaries: EmailAudienceSummary[];
  recipientsById: Map<string, EmailAudienceRecipient[]>;
  overridesById: Map<string, EmailAudienceOverride[]>;
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

function overrideStorageError(message: string): Error {
  const missingTable =
    message.includes('email_group_overrides') &&
    (message.includes('does not exist') || message.includes('schema cache'));
  return new Error(
    missingTable
      ? 'Email group overrides are not available until Supabase migration 0017_email_group_overrides.sql is applied.'
      : message,
  );
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
      .from('email_group_overrides')
      .select('*')
      .order('updated_at', { ascending: true }),
  ]);

  const error =
    programsResult.error ??
    registrationsResult.error ??
    parentsResult.error ??
    overridesResult.error;
  if (error) throw overrideStorageError(error.message);

  const programs = (programsResult.data ?? []) as Program[];
  const registrations = (registrationsResult.data ?? []) as ProgramRegistration[];
  const parents = (parentsResult.data ?? []) as Parent[];
  const overrideRows = (overridesResult.data ?? []) as EmailGroupOverride[];

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
  const audienceOverridesById = new Map<string, EmailAudienceOverride[]>();
  const summaries: EmailAudienceSummary[] = [];
  const overridesByProgram = new Map<string, Map<string, EmailGroupOverride>>();
  for (const override of overrideRows) {
    const programId = override.program_id;
    const email = normalizeAudienceEmail(override.email);
    if (!programId || !email) continue;
    const rows = overridesByProgram.get(programId) ?? new Map<string, EmailGroupOverride>();
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
    const audienceOverrides: EmailAudienceOverride[] = [];
    for (const override of overridesByProgram.get(program.id)?.values() ?? []) {
      const email = normalizeAudienceEmail(override.email);
      if (!email) continue;
      const action = override.action;
      audienceOverrides.push({
        email,
        firstName: override.first_name?.trim() || '',
        lastName: override.last_name?.trim() || '',
        action,
      });
      if (action === 'exclude') {
        byEmail.delete(email);
        manualExcludes += 1;
        continue;
      }
      byEmail.set(email, {
        email,
        firstName: override.first_name?.trim() || '',
        lastName: override.last_name?.trim() || '',
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
    audienceOverridesById.set(
      id,
      audienceOverrides.sort((a, b) => a.email.localeCompare(b.email)),
    );
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
    overridesById: audienceOverridesById,
  };
}

export async function listEmailAudiences(): Promise<EmailAudienceSummary[]> {
  return (await loadProgramAudiences()).summaries;
}

export async function resolveEmailAudience(
  audienceId: string,
): Promise<{
  summary: EmailAudienceSummary;
  recipients: EmailAudienceRecipient[];
  overrides: EmailAudienceOverride[];
} | null> {
  const data = await loadProgramAudiences();
  const summary = data.summaries.find((item) => item.id === audienceId);
  const recipients = data.recipientsById.get(audienceId);
  const overrides = data.overridesById.get(audienceId);
  return summary && recipients && overrides ? { summary, recipients, overrides } : null;
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

  const { error } = await supabase.from('email_group_overrides').upsert({
    program_id: programId,
    email,
    action: input.action,
    first_name: input.firstName?.trim() || null,
    last_name: input.lastName?.trim() || null,
    updated_at: new Date().toISOString(),
  }, {
    onConflict: 'program_id,email',
  });
  if (error) throw overrideStorageError(error.message);
}

export async function clearEmailAudienceOverride(input: {
  audienceId: string;
  email: string;
}): Promise<void> {
  const programId = programIdFromAudienceId(input.audienceId);
  const email = normalizeAudienceEmail(input.email);
  if (!programId || !email) throw new Error('Invalid program group or email address.');

  const { error } = await createAdminClient()
    .from('email_group_overrides')
    .delete()
    .eq('program_id', programId)
    .eq('email', email);
  if (error) throw overrideStorageError(error.message);
}

export async function searchEmailAudienceContacts(
  query: string,
  limit = 20,
): Promise<EmailAudienceContact[]> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];

  const supabase = createAdminClient();
  const [parentsResult, contactsResult] = await Promise.all([
    supabase.from('parents').select('*').not('email', 'is', null).limit(500),
    supabase.from('contacts').select('*').limit(500),
  ]);
  const error = parentsResult.error ?? contactsResult.error;
  if (error) throw new Error(error.message);

  const byEmail = new Map<string, EmailAudienceContact>();
  const candidates: Array<{
    row: Parent | Contact;
    source: EmailAudienceContact['source'];
  }> = [
    ...((parentsResult.data ?? []) as Parent[]).map((row) => ({ row, source: 'parent' as const })),
    ...((contactsResult.data ?? []) as Contact[]).map((row) => ({ row, source: 'contact' as const })),
  ];
  for (const { row, source } of candidates) {
    const email = normalizeAudienceEmail(row.email);
    if (!email || byEmail.has(email)) continue;
    const firstName = row.first_name?.trim() || '';
    const lastName = row.last_name?.trim() || '';
    const searchable = `${firstName} ${lastName} ${email}`.toLowerCase();
    if (!searchable.includes(normalizedQuery)) continue;
    byEmail.set(email, { email, firstName, lastName, source });
  }

  return [...byEmail.values()]
    .sort((a, b) => {
      const aStarts = `${a.firstName} ${a.lastName}`.toLowerCase().startsWith(normalizedQuery);
      const bStarts = `${b.firstName} ${b.lastName}`.toLowerCase().startsWith(normalizedQuery);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      return `${a.lastName} ${a.firstName} ${a.email}`.localeCompare(
        `${b.lastName} ${b.firstName} ${b.email}`,
      );
    })
    .slice(0, limit);
}
