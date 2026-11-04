-- ============================================================
-- SKATE ALLOWANCE: holds count until a terminal payment state
-- Follow-up to 0028. The original counting rule let a hold expire
-- after 24h and stop counting while its Stripe payment intent could
-- still be payable - a late-completing payment could then exceed the
-- 6-skater cap after its slots were re-granted.
--
-- New invariant: a reserved row counts toward the allowance until it
-- is released or consumed. Release happens only with a source-grounded
-- terminal state: Stripe says the payment intent is canceled (or we
-- cancel it), the payment failed/canceled webhook fires, the app's
-- failure paths release it, or it succeeded (then it is consumed).
-- expires_at now only marks a hold as OLD ENOUGH to reconcile against
-- Stripe; it never frees the hold by itself.
--
-- ROLLBACK: re-apply the claim function from 0028.
-- ============================================================

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

  -- Every reserved or consumed slot counts. Reserved slots are only
  -- released by app code with a terminal Stripe state, never by time.
  select count(*) into v_used
  from chai_event_skate_reservations
  where event_id = p_event_id
    and partner_id = p_partner_id
    and status in ('reserved', 'consumed');

  v_grant := greatest(0, least(p_wanted, p_limit - v_used));
  if v_grant > 0 then
    insert into chai_event_skate_reservations (event_id, partner_id, code, claim_token)
    select p_event_id, p_partner_id, p_code, p_claim_token
    from generate_series(1, v_grant);
  end if;
  return v_grant;
end;
$$;

revoke all on function claim_skate_allowance(uuid, uuid, text, integer, text, integer) from public, anon, authenticated;
grant execute on function claim_skate_allowance(uuid, uuid, text, integer, text, integer) to service_role;
