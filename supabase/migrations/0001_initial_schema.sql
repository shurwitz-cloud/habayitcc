-- ============================================================
-- HaBayit Jewish Center — Supabase Schema (Phase 1)
-- ============================================================
-- Design principles:
--   - Families are the central entity; parents and children belong to a family
--   - Programs are generic (Hebrew School, Bar/Bat Mitzvah, future programs)
--     so new programs don't require new tables
--   - Donations and Chai Partners are separate from Program Registrations
--     since they have different lifecycles (recurring billing vs one-time enrollment)
--   - Every table has created_at/updated_at for auditability
--   - UUIDs are used as primary keys throughout for Supabase Auth compatibility later
--   - RLS is NOT enabled yet (Phase 1 has no auth), but tables are structured
--     so Row Level Security policies can be added later without restructuring
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- FAMILIES
-- The central household unit. Parents and children belong to a family.
-- ============================================================
create table families (
  id uuid primary key default gen_random_uuid(),
  family_name text not null,
  street_address text,
  city text,
  state text,
  zip text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- PARENTS
-- Linked to a family. A family can have 0-2+ parents/guardians.
-- ============================================================
create table parents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  relationship text, -- e.g. "Mother", "Father", "Guardian"
  jewish_status text, -- e.g. "Jewish by birth", "Jewish by conversion", "Not Jewish"
  conversion_org text,
  conversion_rabbi text,
  is_primary_contact boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- CHILDREN
-- Linked to a family. Used by Hebrew School, Bar/Bat Mitzvah programs.
-- ============================================================
create table children (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  hebrew_name text,
  date_of_birth date,
  born_before_sunset boolean, -- for accurate Hebrew birthday calculation
  grade text,
  school_attending text,
  allergies text,
  medications text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- PROGRAMS
-- Generic program definitions (Hebrew School, Bar Mitzvah Club, Bat Mitzvah Club,
-- and any future program) so new programs don't require schema changes.
-- ============================================================
create table programs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, -- e.g. "hebrew-school", "bar-mitzvah-club"
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- PROGRAM_REGISTRATIONS
-- One row per child enrolled in a program for a given term/year.
-- Tuition and payment plan live here since they're program-specific.
-- ============================================================
create table program_registrations (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id),
  child_id uuid not null references children(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  term text, -- e.g. "2026-2027"
  status text not null default 'pending', -- pending, accepted, active, withdrawn
  is_chai_partner_rate boolean not null default false,
  chai_partner_code_used text,
  payment_plan text, -- 'full', 'two_installments', 'custom'
  tuition_total numeric(10,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- EVENTS
-- Community events (Shabbat dinners, holiday programs, etc.)
-- ============================================================
create table events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- EVENT_REGISTRATIONS
-- RSVPs/sign-ups for events. Not tied to a family necessarily,
-- since events may have non-member attendees.
-- ============================================================
create table event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  family_id uuid references families(id), -- nullable: guests may not be in the system
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  guest_count integer not null default 1,
  notes text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- DONATIONS
-- One-time gifts. Separate from Chai Partners (recurring) and
-- Program Registrations (tuition) since the giving lifecycle differs.
-- ============================================================
create table donations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id), -- nullable: donors may not be registered families
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  amount numeric(10,2) not null,
  dedication_name text,
  dedication_type text, -- 'honor' or 'memory'
  stripe_payment_intent_id text,
  status text not null default 'pending', -- pending, succeeded, failed, refunded
  created_at timestamptz not null default now()
);

-- ============================================================
-- CHAI_PARTNERS
-- Recurring monthly giving. Separate table from donations because
-- it tracks an ongoing subscription relationship, not a single transaction.
-- ============================================================
create table chai_partners (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  street_address text,
  city text,
  state text,
  zip text,
  monthly_amount numeric(10,2) not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  access_code text unique, -- used for member-rate verification on other forms
  status text not null default 'active', -- active, paused, cancelled
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- PAYMENTS
-- Generic payment ledger across all payment sources (donations,
-- chai partner charges, tuition). Lets us report on "all money in"
-- without joining many tables.
-- ============================================================
create table payments (
  id uuid primary key default gen_random_uuid(),
  source_type text not null, -- 'donation', 'chai_partner', 'program_registration'
  source_id uuid not null, -- points to the relevant row in the source table
  amount numeric(10,2) not null,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  status text not null default 'pending', -- pending, succeeded, failed, refunded
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- CONTACTS
-- General contact form submissions. Not every contact becomes a family.
-- ============================================================
create table contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  interest text, -- e.g. "Hebrew School", "Synagogue", "General"
  message text,
  is_resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- EMAIL_SUBSCRIBERS
-- Newsletter/mass-email list. Kept separate from families/contacts
-- since not every subscriber is otherwise in the system.
-- ============================================================
create table email_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  first_name text,
  last_name text,
  source text, -- e.g. "contact_form", "chai_partner_signup", "manual"
  is_subscribed boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- STAFF_NOTES
-- Internal notes on a family/child, not visible to the public.
-- Generic "notable_type" + "notable_id" pattern to attach notes
-- to any entity without a notes column proliferation.
-- ============================================================
create table staff_notes (
  id uuid primary key default gen_random_uuid(),
  notable_type text not null, -- 'family', 'child', 'donation', etc.
  notable_id uuid not null,
  note text not null,
  created_by text, -- staff member name/email; formalize once auth exists
  created_at timestamptz not null default now()
);

-- ============================================================
-- ATTENDANCE
-- Generic attendance tracking, usable for Hebrew School classes
-- or events, keyed by program_registration or event_registration.
-- ============================================================
create table attendance (
  id uuid primary key default gen_random_uuid(),
  program_registration_id uuid references program_registrations(id) on delete cascade,
  event_registration_id uuid references event_registrations(id) on delete cascade,
  attended_on date not null,
  was_present boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- WAIVERS
-- Signed agreements (policy acknowledgment, photo permission, medical
-- consent). Generic pattern so new waiver types don't need new tables.
-- ============================================================
create table waivers (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id),
  child_id uuid references children(id),
  waiver_type text not null, -- e.g. "hebrew_school_policies", "photo_permission"
  signed_by text not null, -- typed signature name
  signed_at timestamptz not null default now(),
  document_version text -- track which version of policy text was agreed to
);

-- ============================================================
-- SPONSORS
-- Event/program sponsors (future feature, table created now per spec
-- to avoid a future migration, but no UI built yet).
-- ============================================================
create table sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_email text,
  sponsorship_type text, -- e.g. "event", "program", "general"
  amount numeric(10,2),
  notes text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index idx_parents_family_id on parents(family_id);
create index idx_children_family_id on children(family_id);
create index idx_program_registrations_program_id on program_registrations(program_id);
create index idx_program_registrations_child_id on program_registrations(child_id);
create index idx_event_registrations_event_id on event_registrations(event_id);
create index idx_donations_email on donations(email);
create index idx_chai_partners_email on chai_partners(email);
create index idx_chai_partners_access_code on chai_partners(access_code);
create index idx_payments_source on payments(source_type, source_id);
create index idx_staff_notes_notable on staff_notes(notable_type, notable_id);

-- ============================================================
-- SEED DATA: initial program records
-- ============================================================
insert into programs (slug, name, description) values
  ('hebrew-school', 'Hebrew School', 'Joyful Jewish education for children, Sundays 10am-12pm'),
  ('bar-mitzvah-club', 'Bar Mitzvah Club (HaBayit BMX)', 'For 7th grade boys'),
  ('bat-mitzvah-club', 'Bat Mitzvah Club (HaBayit Bloom)', 'For 6th grade girls');
