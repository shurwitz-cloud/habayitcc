-- Complete CRM data capture: RSVPs, program intake fields, donations metadata,
-- important dates (birthdays/yahrzeit), and raw form submission audit log.

-- ── Events: slug for RSVP routing ───────────────────────────────────────────
alter table events add column if not exists slug text;
create unique index if not exists idx_events_slug on events(slug) where slug is not null;

-- ── Families: emergency contact + registration notes ────────────────────────
alter table families add column if not exists emergency_contact_name text;
alter table families add column if not exists emergency_contact_phone text;

-- ── Children: full program intake fields ────────────────────────────────────
alter table children add column if not exists attended_before text;
alter table children add column if not exists hebrew_level text;
alter table children add column if not exists born_sunset_timing text;

-- ── Donations: Stripe form metadata ─────────────────────────────────────────
alter table donations add column if not exists memo text;
alter table donations add column if not exists campaign text;
alter table donations add column if not exists donation_type text;

-- ── Event registrations: slug fallback when event row not synced yet ────────
alter table event_registrations add column if not exists event_slug text;

-- ── Important dates (birthdays, yahrzeit, anniversaries) ────────────────────
create table if not exists important_dates (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id) on delete set null,
  parent_id uuid references parents(id) on delete set null,
  child_id uuid references children(id) on delete set null,
  label text not null,
  date_type text not null,
  gregorian_date date,
  hebrew_date text,
  hebrew_year text,
  notes text,
  notify_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_important_dates_family on important_dates(family_id);
create index if not exists idx_important_dates_type on important_dates(date_type);
create index if not exists idx_important_dates_gregorian on important_dates(gregorian_date);

-- ── Form submissions audit log (raw payload backup for every form) ───────────
create table if not exists form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_type text not null,
  source_id uuid,
  email text,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_form_submissions_type on form_submissions(form_type);
create index if not exists idx_form_submissions_email on form_submissions(email);
create index if not exists idx_form_submissions_created on form_submissions(created_at desc);
