-- One-time redemption of Hebrew Adventure fair/access codes per event.
-- A code may be reused across different events, but only once per event.

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
