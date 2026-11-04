-- ============================================================
-- SKATE CHAI ALLOWANCE RESERVATIONS (Fire on Ice)
-- Race-safe per-member discount allowance for skate events: a Chai
-- member gets at most N discounted skaters per event across all of
-- their registrations. The previous read-then-write check could
-- over-grant when two registrations raced, and a payment completed
-- after someone else consumed the allowance.
--
-- Model: one row per discounted skater slot, claimed atomically by
-- claim_skate_allowance() BEFORE the Stripe payment intent is
-- created, so a customer is never charged for a discount that no
-- longer exists, and a completed payment never has its discount
-- rejected afterwards (its rows are already held).
--
-- Lifecycle: reserved (held for one checkout, expires after 24 hours -
-- longer than any realistic payable Stripe checkout) -> consumed
-- (payment persisted). Expired reserved rows stop
-- counting automatically (no cron needed). Released rows never
-- count. Rows are never deleted, so a slow-but-eventually-paid
-- checkout can still be reconciled by payment_intent_id.
--
-- Couples events keep their existing single-use redemption flow;
-- this table is written only by the skate path.
--
-- Security: the table is RLS-locked (no public policies) and EXECUTE
-- on the functions is revoked from PUBLIC/anon/authenticated - only
-- the service role (server code) can call them.
--
-- ROLLBACK:
--   drop function if exists claim_skate_allowance(uuid, uuid, text, integer, text, integer);
--   drop function if exists consume_skate_allowance(text);
--   drop function if exists release_skate_allowance(text, text);
--   drop table if exists chai_event_skate_reservations;
-- (App code falls back to the registration-scan allowance check when
-- these objects are absent, so rollback never breaks checkout.)
-- ============================================================

create table if not exists chai_event_skate_reservations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  partner_id uuid not null references chai_partners(id) on delete cascade,
  code text not null,
  claim_token text not null,
  payment_intent_id text,
  status text not null default 'reserved'
    check (status in ('reserved', 'consumed', 'released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

-- One claim batch per checkout attempt.
create index if not exists idx_skate_res_claim on chai_event_skate_reservations (claim_token);
-- Consume/reconcile by payment.
create unique index if not exists idx_skate_res_pi_slot
  on chai_event_skate_reservations (payment_intent_id, id)
  where payment_intent_id is not null;
-- Allowance counting.
create index if not exists idx_skate_res_count
  on chai_event_skate_reservations (event_id, partner_id, status, expires_at);

alter table chai_event_skate_reservations enable row level security;
-- No public policies: service-role (admin client) access only.

-- Atomically claim up to p_wanted discounted slots for one member at
-- one event. Locks the member's chai_partners row so concurrent
-- checkouts serialize; counts consumed + unexpired reserved slots;
-- inserts what is actually available and returns that count (0..p_wanted).
create or replace function claim_skate_allowance(
  p_event_id uuid,
  p_partner_id uuid,
  p_code text,
  p_wanted integer,
  p_claim_token text,
  p_limit integer default 6
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
  v_grant integer;
begin
  -- Serialize claims per member.
  perform 1 from chai_partners where id = p_partner_id for update;

  select count(*) into v_used
  from chai_event_skate_reservations
  where event_id = p_event_id
    and partner_id = p_partner_id
    and (status = 'consumed' or (status = 'reserved' and expires_at > now()));

  v_grant := greatest(0, least(p_wanted, p_limit - v_used));
  if v_grant > 0 then
    insert into chai_event_skate_reservations (event_id, partner_id, code, claim_token)
    select p_event_id, p_partner_id, p_code, p_claim_token
    from generate_series(1, v_grant);
  end if;
  return v_grant;
end;
$$;

-- Mark a checkout's held slots as consumed once payment is persisted.
-- Keyed by payment intent (bound by the app right after the Stripe
-- payment intent is created). Idempotent; safe to call from both the
-- form-submit path and the Stripe webhook (retries included).
create or replace function consume_skate_allowance(
  p_payment_intent_id text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update chai_event_skate_reservations
  set status = 'consumed', updated_at = now()
  where payment_intent_id = p_payment_intent_id
    and status = 'reserved';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Release a checkout's held slots (payment failed/abandoned early, or
-- registration persistence failed). Accepts the claim token (before a
-- payment intent is bound) or the payment intent id (after binding).
create or replace function release_skate_allowance(
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
  update chai_event_skate_reservations
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

-- SECURITY DEFINER functions default to EXECUTE for PUBLIC: lock down.
revoke all on function claim_skate_allowance(uuid, uuid, text, integer, text, integer) from public, anon, authenticated;
revoke all on function consume_skate_allowance(text) from public, anon, authenticated;
revoke all on function release_skate_allowance(text, text) from public, anon, authenticated;
grant execute on function claim_skate_allowance(uuid, uuid, text, integer, text, integer) to service_role;
grant execute on function consume_skate_allowance(text) to service_role;
grant execute on function release_skate_allowance(text, text) to service_role;
