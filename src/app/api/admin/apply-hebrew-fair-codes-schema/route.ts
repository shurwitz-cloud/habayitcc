import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '@/lib/admin/auth';

export const dynamic = 'force-dynamic';

const PROJECT_REF = 'vrhgcxlpaocmmdnibehe';

const SCHEMA_SQL = `
alter table program_registrations
  add column if not exists fair_access_code text;

create unique index if not exists idx_program_registrations_fair_access_code
  on program_registrations (fair_access_code)
  where fair_access_code is not null;

create table if not exists hebrew_fair_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  program_registration_id uuid not null references program_registrations(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  event_registration_id uuid references event_registrations(id) on delete set null,
  fair_access_code text not null,
  redeemed_at timestamptz not null default now(),
  unique (program_registration_id, event_id)
);

create index if not exists idx_hebrew_fair_code_redemptions_event
  on hebrew_fair_code_redemptions (event_id);

create index if not exists idx_hebrew_fair_code_redemptions_code
  on hebrew_fair_code_redemptions (fair_access_code);
`.trim();

/**
 * POST /api/admin/apply-hebrew-fair-codes-schema
 * Body: { accessToken: "<supabase personal access token>" }
 * Applies fair_access_code column + redemptions table via Management API.
 */
export async function POST(req: NextRequest) {
  if (!(await requireCapability('registrations'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let accessToken =
    process.env.SUPABASE_ACCESS_TOKEN?.trim() ||
    process.env.SUPABASE_MANAGEMENT_TOKEN?.trim() ||
    '';

  try {
    const body = (await req.json()) as { accessToken?: string };
    if (body.accessToken?.trim()) {
      accessToken = body.accessToken.trim();
    }
  } catch {
    // optional body
  }

  if (!accessToken) {
    return NextResponse.json(
      {
        error: 'Missing Supabase access token.',
        hint: 'Create a token at https://supabase.com/dashboard/account/tokens then paste it here, or set SUPABASE_ACCESS_TOKEN in Vercel.',
        sql: SCHEMA_SQL,
        sqlEditorUrl: `https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new`,
      },
      { status: 400 },
    );
  }

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: SCHEMA_SQL }),
    },
  );

  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json(
      {
        error: `Schema apply failed (${res.status}): ${text.slice(0, 500)}`,
        sql: SCHEMA_SQL,
        sqlEditorUrl: `https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: 'Schema applied. Click Issue / refresh Hebrew event codes next.',
  });
}

export async function GET() {
  if (!(await requireCapability('registrations'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    sql: SCHEMA_SQL,
    sqlEditorUrl: `https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new`,
  });
}
