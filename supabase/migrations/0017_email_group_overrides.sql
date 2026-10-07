-- Persistent per-program email audience inclusions and exclusions.
-- Service-role server code is the only caller; browser roles get no access.

create table if not exists email_group_overrides (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  email text not null,
  action text not null check (action in ('include', 'exclude')),
  first_name text,
  last_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_group_overrides_normalized_email
    check (email = lower(btrim(email))),
  unique (program_id, email)
);

create index if not exists idx_email_group_overrides_program
  on email_group_overrides(program_id);

alter table email_group_overrides enable row level security;
revoke all on table email_group_overrides from anon, authenticated;

-- Preserve overrides created by the temporary form_submissions implementation.
insert into email_group_overrides (
  program_id,
  email,
  action,
  first_name,
  last_name,
  created_at,
  updated_at
)
select distinct on (fs.source_id, lower(btrim(fs.email)))
  fs.source_id::uuid,
  lower(btrim(fs.email)),
  fs.payload->>'action',
  nullif(btrim(fs.payload->>'first_name'), ''),
  nullif(btrim(fs.payload->>'last_name'), ''),
  fs.created_at,
  fs.created_at
from form_submissions fs
join programs p on p.id::text = fs.source_id
where fs.form_type = 'email_group_override'
  and fs.source_id is not null
  and fs.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and fs.email is not null
  and btrim(fs.email) <> ''
  and fs.payload->>'action' in ('include', 'exclude')
order by fs.source_id, lower(btrim(fs.email)), fs.created_at desc
on conflict (program_id, email) do nothing;
