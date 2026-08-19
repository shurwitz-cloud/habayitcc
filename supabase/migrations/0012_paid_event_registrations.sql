-- Paid community event registrations + Hebrew Adventure fair access codes

alter table program_registrations
  add column if not exists fair_access_code text;

create unique index if not exists idx_program_registrations_fair_access_code
  on program_registrations (fair_access_code)
  where fair_access_code is not null;

alter table event_registrations
  add column if not exists amount numeric(10,2),
  add column if not exists sponsor_amount numeric(10,2),
  add column if not exists card_fee numeric(10,2),
  add column if not exists stripe_payment_intent_id text,
  add column if not exists registration_details jsonb;

create index if not exists idx_event_registrations_stripe_pi
  on event_registrations (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
