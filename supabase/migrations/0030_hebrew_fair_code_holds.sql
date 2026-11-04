-- ============================================================
-- HEBREW ADVENTURE CODE HOLDS (Fire on Ice 3% discount)
-- Race-safe one-use-per-event holds for Hebrew Adventure event
-- codes used as a paid discount (3% off one skater per code).
-- hebrew_fair_code_redemptions stays the permanent "used" record;
-- this table holds a code between checkout start and payment, so
-- two simultaneous checkouts can never spend the same code.
--
-- Model: one active row per (program_registration_id, event_id),
-- claimed atomically by claim_hebrew_fair_code_hold() BEFORE the
-- Stripe payment intent is created, so a customer is never charged
-- for a discount that no longer exists, and a completed payment
-- never has its discount rejected afterwards (its rows are already
-- held).
--
-- Lifecycle: reserved (held for one checkout) -> consumed (payment
-- persisted; a redemptions row is written) or released (checkout
-- failed). Released rows never count and the code may be used again.
-- Rows are never deleted, so a slow-but-eventually-paid checkout can
-- still be reconciled by payment_intent_id. expires_at only marks a
-- hold as OLD ENOUGH to reconcile against Stripe's live payment
-- state; it never frees the hold by itself (mirrors 0029).
--
-- Security: the table is RLS-locked (no public policies) and EXECUTE
-- on the functions is revoked from PUBLIC/anon/authenticated - only
-- the service role (server code) can call them.
--
-- ROLLBACK:
--   drop function if exists claim_hebrew_fair_code_hold(uuid, uuid, text, text);
--   drop function if exists consume_hebrew_fair_code_holds(text, uuid);
--   drop function if exists release_hebrew_fair_code_holds(text, text);
--   drop table if exists hebrew_fair_code_holds;
-- (App code treats missing objects as "holds unsupported" and fails
-- closed for the HA discount, so rollback never breaks checkout.)
-- ============================================================

create table if not exists hebrew_fair_code_holds (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  program_registration_id uuid not null references program_registrations(id) on delete cascade,
  code text not null,
  claim_token text not null,
  payment_intent_id text,
  status text not null default 'reserved'
    check (status in ('reserved', 'consumed', 'released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

-- One ACTIVE hold per code per event (released rows do not block).
create unique index if not exists idx_ha_holds_active
  on hebrew_fair_code_holds (program_registration_id, event_id)
  where status in ('reserved', 'consumed');
-- One claim batch per checkout attempt.
create index if not exists idx_ha_holds_claim on hebrew_fair_code_holds (claim_token);
-- Consume/reconcile by payment.
create index if not exists idx_ha_holds_pi
  on hebrew_fair_code_holds (payment_intent_id)
  where payment_intent_id is not null;

alter table hebrew_fair_code_holds enable row level security;
-- No public policies: service-role (admin client) access only.

-- Atomically hold one code for one event. Locks the code's
-- program_registrations row so concurrent checkouts serialize.
-- Returns true only when this call inserted the hold: refuses when
-- the code was already redeemed for the event or another active
-- hold exists.
create or replace function claim_hebrew_fair_code_hold(
  p_event_id uuid,
  p_registration_id uuid,
  p_code text,
  p_claim_token text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Serialize claims per code.
  perform 1 from program_registrations where id = p_registration_id for update;

  -- Already redeemed for this event: permanent no.
  if exists (
    select 1 from hebrew_fair_code_redemptions
    where program_registration_id = p_registration_id and event_id = p_event_id
  ) then
    return false;
  end if;

  -- Another checkout holds (or already consumed) this code here.
  if exists (
    select 1 from hebrew_fair_code_holds
    where program_registration_id = p_registration_id
      and event_id = p_event_id
      and status in ('reserved', 'consumed')
  ) then
    return false;
  end if;

  insert into hebrew_fair_code_holds (event_id, program_registration_id, code, claim_token)
  values (p_event_id, p_registration_id, p_code, p_claim_token);
  return true;
end;
$$;

-- Mark a checkout's held codes as consumed once payment is persisted
-- and write the permanent redemptions rows. Keyed by payment intent
-- (bound by the app right after the Stripe payment intent is
-- created). Idempotent; safe to call from both the form-submit path
-- and the Stripe webhook (retries included).
create or replace function consume_hebrew_fair_code_holds(
  p_payment_intent_id text,
  p_event_registration_id uuid default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into hebrew_fair_code_redemptions
    (program_registration_id, event_id, event_registration_id, fair_access_code)
  select h.program_registration_id, h.event_id, p_event_registration_id, h.code
  from hebrew_fair_code_holds h
  where h.payment_intent_id = p_payment_intent_id
    and h.status = 'reserved'
  on conflict (program_registration_id, event_id) do nothing;

  update hebrew_fair_code_holds
  set status = 'consumed', updated_at = now()
  where payment_intent_id = p_payment_intent_id
    and status = 'reserved';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Release held codes (checkout failed or registration did not
-- persist). Only reserved rows are touched; a consumed hold is
-- permanent.
create or replace function release_hebrew_fair_code_holds(
  p_claim_token text default null,
  p_payment_intent_id text default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update hebrew_fair_code_holds
  set status = 'released', updated_at = now()
  where status = 'reserved'
    and (
      (p_claim_token is not null and claim_token = p_claim_token)
      or (p_payment_intent_id is not null and payment_intent_id = p_payment_intent_id)
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function claim_hebrew_fair_code_hold(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function consume_hebrew_fair_code_holds(text, uuid) from public, anon, authenticated;
revoke all on function release_hebrew_fair_code_holds(text, text) from public, anon, authenticated;
grant execute on function claim_hebrew_fair_code_hold(uuid, uuid, text, text) to service_role;
grant execute on function consume_hebrew_fair_code_holds(text, uuid) to service_role;
grant execute on function release_hebrew_fair_code_holds(text, text) to service_role;
