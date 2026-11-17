-- ============================================================
-- EVENT-SCOPED GIFT CARD CLAIMS (Topgolf Chanukah Kickoff)
-- Migration 0031 created bbq_staff_codes with an event_slug
-- column, but `code` was the primary key and claim matched on
-- code alone. The Teens Topgolf event REUSES the same gift card
-- code strings already handed to the volunteer teens for the
-- BBQ (Shmuel, 2026-11-17: "keep the same code as the barbecue -
-- they can use it for this one too"), with independent per-event
-- redemption: using a code at the BBQ must not consume the
-- Topgolf admission, and vice versa.
--
-- This migration:
--   1. Replaces the primary key with the composite (code,
--      event_slug) so the same code string can live once per
--      event with its own available -> held -> consumed state.
--      Nothing references bbq_staff_codes.code, so the swap is
--      safe; the table holds 10 rows.
--   2. ADDS claim_event_gift_code (code + claim token + event),
--      leaving the original claim_bbq_staff_code in place so the
--      previously deployed app keeps working unchanged until the
--      new app (which calls the scoped function) is serving.
--      Drop the old function in a later cleanup once no
--      deployment calls it.
--
-- The table, statuses, hold lifecycle and RLS are otherwise
-- unchanged. No codes are created here: at go-live the Topgolf
-- rows are inserted by copying the existing BBQ strings -
--   insert into bbq_staff_codes (code, event_slug)
--   select code, 'teens-topgolf' from bbq_staff_codes
--   where event_slug = 'teens-bbq';
-- so plaintext codes never enter the repo.
--
-- Note: resolve_expired_bbq_staff_code (0031, unused by app code)
-- still matches on code alone; if it is ever wired up it must
-- gain an event_slug argument first.
--
-- ROLLBACK:
--   drop function if exists claim_event_gift_code(text, text, text);
--   alter table bbq_staff_codes drop constraint bbq_staff_codes_pkey;
--   delete from bbq_staff_codes where event_slug = 'teens-topgolf';
--   alter table bbq_staff_codes add primary key (code);
-- (App code treats a missing function as "codes unsupported" and
-- fails closed - no discount granted.)
-- ============================================================

alter table bbq_staff_codes drop constraint bbq_staff_codes_pkey;
alter table bbq_staff_codes add primary key (code, event_slug);

-- Atomically hold a gift card code for one checkout, scoped to its
-- event. Same lock semantics as claim_bbq_staff_code: the single
-- UPDATE is the lock; idempotent for the same claim token.
create or replace function claim_event_gift_code(
  p_code text,
  p_claim_token text,
  p_event_slug text
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
     and event_slug = p_event_slug
     and (
       status = 'available'
       or (status = 'held' and claim_token = p_claim_token)
     );
  return found;
end;
$$;

revoke all on function claim_event_gift_code(text, text, text) from public, anon, authenticated;
