-- Hebrew Adventure attendance (and later programs such as BMX, Achim, Bloom).
-- One roster row per child per program while they are in a class.
-- One session per class per date. Marks, behavior, and participation hang off that session.
-- Torah study and Hebrew reading are a dated history on the child, not a single overwritten note.
-- removed_on is the first date the child is off the roster. Earlier Sundays stay in their record.

create table if not exists class_rosters (
  id uuid primary key default gen_random_uuid(),
  program_slug text not null,
  class_key text not null,
  child_id uuid not null references children(id) on delete cascade,
  status text not null default 'enrolled' check (status in ('enrolled', 'tryout')),
  joined_on date not null default current_date,
  removed_on date,
  created_at timestamptz not null default now()
);

create unique index if not exists class_rosters_one_active_class
  on class_rosters (program_slug, child_id)
  where removed_on is null;

create index if not exists class_rosters_program_class
  on class_rosters (program_slug, class_key);

create table if not exists class_sessions (
  id uuid primary key default gen_random_uuid(),
  program_slug text not null,
  class_key text not null,
  session_date date not null,
  created_at timestamptz not null default now(),
  unique (program_slug, class_key, session_date)
);

create table if not exists learning_progress (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references children(id) on delete cascade,
  program_slug text not null,
  track text not null check (track in ('torah', 'hebrew_reading')),
  standing text not null,
  note text,
  recorded_on date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists learning_progress_child
  on learning_progress (child_id, program_slug, track, recorded_on desc);

alter table attendance add column if not exists child_id uuid references children(id) on delete cascade;
alter table attendance add column if not exists class_session_id uuid references class_sessions(id) on delete cascade;
alter table attendance add column if not exists behavior_note text;
alter table attendance add column if not exists participation_note text;
alter table attendance alter column was_present drop not null;
alter table attendance alter column was_present drop default;

create unique index if not exists attendance_one_mark_per_session
  on attendance (class_session_id, child_id)
  where class_session_id is not null and child_id is not null;

create index if not exists attendance_child_id on attendance (child_id);

do $$
declare
  t text;
begin
  foreach t in array array['class_rosters', 'class_sessions', 'learning_progress']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;
