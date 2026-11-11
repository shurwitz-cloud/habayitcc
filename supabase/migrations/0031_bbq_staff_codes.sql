-- ============================================================
-- BBQ STAFF CODES (Teens BBQ Kickoff one-time codes)
-- Race-safe one-time access codes for the teens BBQ event. Ten
-- codes are issued privately by the office; each code covers one
-- admission exactly once. Codes are inserted by a private script
-- at go-live - this migration creates NO codes, so no plaintext
-- codes ever enter the repo.
--
-- Model: one row per issued code, status available -> held ->
-- consumed. A checkout claims the code atomically BEFORE the
-- Stripe payment intent is created, so a customer is never
-- charged for a discount that no longer exists, and a completed
-- payment never has its code rejected afterwards (its row is
-- already held). A free ($0) registration claims and consumes in
-- one submit. Released rows return to available only when no
-- payment was ever bound, so a paid discount is never freed.
--
-- Lifecycle: claim (available -> held) -> bind payment intent id
-- -> consume when the registration persists (submit path or
-- webhook, idempotent) or release on checkout failure. expires_at
-- only marks a hold as OLD ENOUGH to reconcile against Stripe's
-- live payment state; it never frees the hold by itself (mirrors
-- 0029/0030).
--
-- Security: the table is RLS-locked (no public policies) and
-- EXECUTE on the functions is revoked from PUBLIC/anon/
-- authenticated - only the service role (server code) can call
-- them.
--
-- ROLLBACK:
--   drop function if exists claim_bbq_staff_code(text, text);
--   drop function if exists bind_bbq_staff_code_payment(text, text);
--   drop function if exists consume_bbq_staff_code(text, uuid);
--   drop function if exists release_bbq_staff_code(text);
--   drop function if exists resolve_expired_bbq_staff_code(text, text);
--   drop table if exists bbq_staff_codes;
-- (App code treats missing objects as "staff codes unsupported"
-- and fails closed - no discount granted - so rollback never
-- breaks checkout.)
-- ============================================================

create table if not exists bbq_staff_codes (
  code text primary key,
  event_slug text not null default 'teens-bbq',
  status text not null default 'available'
    check (status in ('available', 'held', 'consumed')),
  claim_token text,
  payment_intent_id text,
  event_registration_id uuid references event_registrations(id) on delete set null,
  expires_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Consume/reconcile by payment.
create index if not exists idx_bbq_staff_codes_pi
  on bbq_staff_codes (payment_intent_id)
  where payment_intent_id is not null;
create index if not exists idx_bbq_staff_codes_claim
  on bbq_staff_codes (claim_token)
  where claim_token is not null;

alter table bbq_staff_codes enable row level security;
-- No public policies: service-role (admin client) access only.

-- Atomically hold a code for one checkout. The single UPDATE is
-- the lock: two concurrent checkouts can never both flip the same
-- available code. Idempotent for the same claim token (safe
-- retry). Returns true only when this call holds the code.
create or replace function claim_bbq_staff_code(
  p_code text,
  p_claim_token text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update bbq_staff_codes
     set status = 'held',
         claim_token = p_claim_token,
         expires_at = now() + interval '2 hours',
         updated_at = now()
   where code = p_code
     and (
       status = 'available'
       or (status = 'held' and claim_token = p_claim_token)
     );
  return found;
end;
$$;

-- Bind a held code to the Stripe payment intent that relies on it.
create or replace function bind_bbq_staff_code_payment(
  p_claim_token text,
  p_payment_intent_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update bbq_staff_codes
     set payment_intent_id = p_payment_intent_id,
         updated_at = now()
   where claim_token = p_claim_token
     and status = 'held';
end;
$$;

-- Mark a held code used once its registration persisted. Idempotent
-- per registration: consuming an already-consumed row is fine only
-- when it already belongs to this registration.
create or replace function consume_bbq_staff_code(
  p_claim_token text,
  p_registration_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update bbq_staff_codes
     set status = 'consumed',
         event_registration_id = p_registration_id,
         consumed_at = now(),
         updated_at = now()
   where claim_token = p_claim_token
     and (
       status = 'held'
       or (status = 'consumed' and event_registration_id = p_registration_id)
     );
  return found;
end;
$$;

-- Free a held code ONLY when no payment was ever bound to it. A
-- hold with a payment intent is never freed here; it is reconciled
-- against Stripe instead, so a paid discount can never be
-- re-granted.
create or replace function release_bbq_staff_code(
  p_claim_token text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update bbq_staff_codes
     set status = 'available',
         claim_token = null,
         expires_at = null,
         updated_at = now()
   where claim_token = p_claim_token
     and status = 'held'
     and payment_intent_id is null;
end;
$$;

-- Resolve an expired hold after the app reconciled it against
-- Stripe's live payment-intent state: 'consumed' when the payment
-- succeeded, 'available' when it can never complete. Never called
-- for a hold whose expiry has not passed.
create or replace function resolve_expired_bbq_staff_code(
  p_code text,
  p_resolution text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_resolution not in ('consumed', 'available') then
    return false;
  end if;
  update bbq_staff_codes
     set status = p_resolution,
         consumed_at = case when p_resolution = 'consumed' then now() else null end,
         claim_token = case when p_resolution = 'available' then null else claim_token end,
         expires_at = case when p_resolution = 'available' then null else expires_at end,
         updated_at = now()
   where code = p_code
     and status = 'held'
     and expires_at < now();
  return found;
end;
$$;

revoke all on function claim_bbq_staff_code(text, text) from public, anon, authenticated;
revoke all on function bind_bbq_staff_code_payment(text, text) from public, anon, authenticated;
revoke all on function consume_bbq_staff_code(text, uuid) from public, anon, authenticated;
revoke all on function release_bbq_staff_code(text) from public, anon, authenticated;
revoke all on function resolve_expired_bbq_staff_code(text, text) from public, anon, authenticated;
