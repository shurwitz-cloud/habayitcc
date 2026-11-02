-- ============================================================
-- QUID PRO QUO (goods sold that the admin explicitly includes
-- as a donation) + ENTRY AUDIT LOG + TRANSACTIONAL RECLASSIFY
--
-- IRS quid-pro-quo rule: when a payment is partly for goods or
-- services, only the excess over the goods' fair market value is
-- deductible, and the receipt must disclose the goods and their
-- good-faith estimated value. These columns let an admin record
-- that explicitly per entry. NULL on every existing row: legacy
-- donations are untouched and receipt wording for them is
-- unchanged.
-- ============================================================

alter table donations
  add column if not exists goods_payment_id uuid, -- link back to goods_payments when the payment was entered as goods
  add column if not exists goods_description text, -- e.g. 'Tefillin x1'
  add column if not exists goods_fmv numeric(10,2), -- admin's good-faith estimate of what was received
  add column if not exists deductible_amount numeric(10,2); -- amount - goods_fmv, computed and validated at write time

-- Every payment keeps ONE identity across reclassification:
-- goods_payments.payment_key == donations.stripe_payment_intent_id == payments.stripe_payment_intent_id
alter table goods_payments
  add column if not exists include_as_donation boolean not null default false,
  add column if not exists donation_id uuid; -- set when the payment is also included as a donation

-- Admin-only audit trail for entry edits / reclassification.
create table if not exists entry_audit_log (
  id uuid primary key default gen_random_uuid(),
  payment_key text not null, -- the ONE financial identity
  action text not null, -- 'edit' | 'reclassify' | 'email_resent' | 'receipt_regenerated'
  from_kind text, -- 'one_time' | 'monthly' | 'chai_partner' | 'goods_services'
  to_kind text,
  changes jsonb not null default '{}', -- { field: { from, to } }
  note text,
  created_by text, -- admin email when known
  created_at timestamptz not null default now()
);
alter table entry_audit_log enable row level security; -- service role only, same as other CRM tables
create index if not exists idx_entry_audit_log_payment_key on entry_audit_log(payment_key);

-- ============================================================
-- Transactional reclassification. One function call = one
-- transaction: the row can never exist in both tables or neither.
-- Direction A: goods -> donation-only (admin drops goods tracking:
-- goods row kept for the goods statement ONLY when it was flagged
-- include_in_year_end; otherwise it is absorbed into the donation)
-- Direction B: donation -> goods (donation row removed; goods row
-- created/kept; tax receipt generators never see it again)
-- The single payments-ledger row is updated in place, never
-- duplicated. Audit row written in the same transaction.
-- ============================================================
create or replace function reclassify_payment(
  p_payment_key text,
  p_to_kind text, -- 'one_time' | 'goods_services'
  p_goods_item_label text default null,
  p_goods_fmv numeric default null,
  p_include_in_year_end boolean default false,
  p_changes jsonb default '{}',
  p_created_by text default null
) returns jsonb language plpgsql as $$
declare
  v_don donations%rowtype;
  v_goods goods_payments%rowtype;
  v_donation_id uuid;
  v_goods_id uuid;
  v_ledger payments%rowtype;
begin
  -- Locate the payment by its ONE identity.
  select * into v_don from donations where stripe_payment_intent_id = p_payment_key;
  select * into v_goods from goods_payments where payment_key = p_payment_key;
  select * into v_ledger from payments where stripe_payment_intent_id = p_payment_key;
  if v_don.id is null and v_goods.id is null then
    raise exception 'payment not found: %', p_payment_key;
  end if;

  if p_to_kind in ('one_time', 'monthly') then
    -- goods (or nothing) -> donation
    if v_don.id is null then
      insert into donations (
        first_name, last_name, email, phone, amount,
        stripe_payment_intent_id, status, donation_type, memo, created_at,
        goods_payment_id, goods_description, goods_fmv, deductible_amount
      ) values (
        v_goods.first_name, v_goods.last_name, v_goods.email, v_goods.phone,
        v_goods.amount, p_payment_key, 'succeeded',
        case when p_to_kind = 'monthly' then 'Monthly' else 'One-time' end,
        v_goods.memo, coalesce(v_goods.paid_at, now()),
        v_goods.id,
        case when p_goods_fmv is not null and p_goods_fmv > 0
          then v_goods.item_label || ' x' || v_goods.quantity else null end,
        case when p_goods_fmv is not null and p_goods_fmv > 0 then p_goods_fmv else null end,
        case when p_goods_fmv is not null and p_goods_fmv > 0
          then greatest(0, v_goods.amount - p_goods_fmv)
          else null end
      ) returning id into v_donation_id;
      update goods_payments
        set include_as_donation = true, donation_id = v_donation_id
        where id = v_goods.id;
      -- Absorb the goods row only when it is not needed for the
      -- separate year-end goods/services statement.
      if not coalesce(v_goods.include_in_year_end, p_include_in_year_end) then
        delete from goods_payments where id = v_goods.id;
      end if;
    end if;
    update payments set source_type = 'donation'
      where stripe_payment_intent_id = p_payment_key;
  elsif p_to_kind = 'goods_services' then
    -- donation -> goods
    if v_goods.id is null then
      insert into goods_payments (
        first_name, last_name, email, phone, item_label,
        quantity, unit_amount, amount, payment_method, memo,
        payment_key, include_in_year_end, paid_at
      ) values (
        v_don.first_name, v_don.last_name, v_don.email, v_don.phone,
        coalesce(p_goods_item_label, 'Other'), 1, v_don.amount, v_don.amount,
        v_ledger.payment_method, v_don.memo, p_payment_key,
        p_include_in_year_end, coalesce(v_ledger.paid_at, v_don.created_at)
      ) returning id into v_goods_id;
    end if;
    delete from donations where id = v_don.id; -- no longer a donation: must leave tax receipt generators
    update payments set source_type = 'goods_payment'
      where stripe_payment_intent_id = p_payment_key;
  else
    raise exception 'unsupported reclassify target: %', p_to_kind;
  end if;

  insert into entry_audit_log (payment_key, action, from_kind, to_kind, changes, created_by)
  values (p_payment_key, 'reclassify',
          case when v_don.id is not null then 'donation' else 'goods_services' end,
          p_to_kind, p_changes, p_created_by);

  return jsonb_build_object('ok', true, 'donation_id', v_donation_id, 'goods_id', v_goods_id);
end;
$$;

-- ============================================================
-- Transactional field edit. Updates whichever table holds the
-- payment (donations or goods_payments), syncs the SINGLE ledger
-- row (amount / method / paid_at) so "all money in" stays whole,
-- and writes the audit row - all in one transaction.
-- Only whitelisted fields are editable. Email/phone/name changes
-- move with the record; the ledger row keeps the same identity.
-- ============================================================
create or replace function edit_payment(
  p_payment_key text,
  p_changes jsonb, -- { field: newValue }; allowed: first_name,last_name,email,phone,amount,memo,paid_at,payment_method,campaign
  p_created_by text default null,
  p_note text default null
) returns jsonb language plpgsql as $$
declare
  v_don donations%rowtype;
  v_goods goods_payments%rowtype;
  v_old jsonb := '{}';
  v_field text;
  v_allowed text[] := array['first_name','last_name','email','phone','amount','memo','paid_at','payment_method','campaign','item_label','include_in_year_end'];
begin
  select * into v_don from donations where stripe_payment_intent_id = p_payment_key;
  select * into v_goods from goods_payments where payment_key = p_payment_key;
  if v_don.id is null and v_goods.id is null then
    raise exception 'payment not found: %', p_payment_key;
  end if;

  foreach v_field in array v_allowed loop
    if p_changes ? v_field then
      if v_don.id is not null then
        v_old := v_old || jsonb_build_object(v_field, to_jsonb(v_don) -> v_field);
        case v_field
          when 'first_name' then update donations set first_name = (p_changes->>v_field) where id = v_don.id;
          when 'last_name'  then update donations set last_name  = (p_changes->>v_field) where id = v_don.id;
          when 'email'      then update donations set email      = lower(trim(p_changes->>v_field)) where id = v_don.id;
          when 'phone'      then update donations set phone      = (p_changes->>v_field) where id = v_don.id;
          when 'amount'     then update donations set amount     = (p_changes->>v_field)::numeric where id = v_don.id;
          when 'memo'       then update donations set memo       = (p_changes->>v_field) where id = v_don.id;
          when 'paid_at'    then update donations set created_at = (p_changes->>v_field)::timestamptz where id = v_don.id; -- donations date convention: created_at carries the payment date
          when 'campaign'   then update donations set campaign   = (p_changes->>v_field) where id = v_don.id;
          when 'payment_method' then null; -- ledger only
          when 'item_label' then null; -- goods-only field
          when 'include_in_year_end' then null; -- goods-only field
        end case;
      else
        v_old := v_old || jsonb_build_object(v_field, to_jsonb(v_goods) -> v_field);
        case v_field
          when 'first_name' then update goods_payments set first_name = (p_changes->>v_field) where id = v_goods.id;
          when 'last_name'  then update goods_payments set last_name  = (p_changes->>v_field) where id = v_goods.id;
          when 'email'      then update goods_payments set email      = lower(trim(p_changes->>v_field)) where id = v_goods.id;
          when 'phone'      then update goods_payments set phone      = (p_changes->>v_field) where id = v_goods.id;
          when 'amount'     then update goods_payments set amount     = (p_changes->>v_field)::numeric,
                                          unit_amount = (p_changes->>v_field)::numeric / greatest(quantity,1)
                                          where id = v_goods.id;
          when 'memo'       then update goods_payments set memo       = (p_changes->>v_field) where id = v_goods.id;
          when 'paid_at'    then update goods_payments set paid_at    = (p_changes->>v_field)::timestamptz where id = v_goods.id;
          when 'payment_method' then update goods_payments set payment_method = (p_changes->>v_field) where id = v_goods.id;
          when 'campaign'   then null; -- goods rows have no campaign
          when 'item_label' then update goods_payments set item_label = (p_changes->>v_field) where id = v_goods.id;
          when 'include_in_year_end' then update goods_payments set include_in_year_end = (p_changes->>v_field)::boolean where id = v_goods.id;
        end case;
      end if;
    end if;
  end loop;

  -- Sync the single ledger row; never insert a second one.
  update payments set
    amount = coalesce((p_changes->>'amount')::numeric, amount),
    payment_method = coalesce(p_changes->>'payment_method', payment_method),
    paid_at = coalesce((p_changes->>'paid_at')::timestamptz, paid_at)
  where stripe_payment_intent_id = p_payment_key;

  insert into entry_audit_log (payment_key, action, changes, note, created_by)
  values (p_payment_key, 'edit', jsonb_build_object('from', v_old, 'to', p_changes), p_note, p_created_by);

  return jsonb_build_object('ok', true);
end;
$$;

-- ============================================================
-- Transactional goods-payment creation. goods_payments row +
-- single payments-ledger row + optional LINKED donations row
-- (explicit per-entry admin choice, with quid-pro-quo fields) -
-- all-or-nothing. A unique payment_key conflict returns
-- duplicate=true instead of a second record.
-- ============================================================
create or replace function record_goods_payment_tx(
  p_first_name text, p_last_name text, p_email text, p_phone text,
  p_item_label text, p_quantity integer, p_unit_amount numeric, p_amount numeric,
  p_payment_method text, p_memo text, p_payment_key text, p_paid_at timestamptz,
  p_include_in_year_end boolean, p_include_as_donation boolean,
  p_goods_fmv numeric default null
) returns jsonb language plpgsql as $$
declare
  v_goods_id uuid;
  v_donation_id uuid;
  v_existing uuid;
begin
  select id into v_existing from goods_payments where payment_key = p_payment_key;
  if v_existing is not null then
    return jsonb_build_object('ok', true, 'duplicate', true, 'goods_payment_id', v_existing);
  end if;

  insert into goods_payments (
    first_name, last_name, email, phone, item_label, quantity,
    unit_amount, amount, payment_method, memo, payment_key,
    include_in_year_end, include_as_donation, paid_at
  ) values (
    trim(p_first_name), trim(p_last_name), lower(trim(p_email)), nullif(trim(p_phone), ''),
    trim(p_item_label), greatest(1, p_quantity), p_unit_amount, p_amount,
    p_payment_method, nullif(trim(p_memo), ''), p_payment_key,
    p_include_in_year_end, p_include_as_donation, coalesce(p_paid_at, now())
  ) returning id into v_goods_id;

  insert into payments (
    source_type, source_id, amount, stripe_payment_intent_id, payment_method, status, paid_at
  ) values (
    'goods_payment', v_goods_id, p_amount, p_payment_key, p_payment_method, 'succeeded',
    coalesce(p_paid_at, now())
  );

  if p_include_as_donation then
    insert into donations (
      first_name, last_name, email, phone, amount,
      stripe_payment_intent_id, status, donation_type, memo, created_at,
      goods_payment_id, goods_description, goods_fmv, deductible_amount
    ) values (
      trim(p_first_name), trim(p_last_name), lower(trim(p_email)), nullif(trim(p_phone), ''),
      p_amount, p_payment_key, 'succeeded', 'One-time', nullif(trim(p_memo), ''),
      coalesce(p_paid_at, now()),
      v_goods_id,
      -- Quid-pro-quo disclosure fields only when the admin entered a real
      -- value received (fmv > 0). fmv = 0 means the admin attested nothing
      -- was received: a plain full-amount donation with no goods disclosure.
      case when p_goods_fmv is not null and p_goods_fmv > 0
        then trim(p_item_label) || ' x' || greatest(1, p_quantity) else null end,
      case when p_goods_fmv is not null and p_goods_fmv > 0 then p_goods_fmv else null end,
      case when p_goods_fmv is not null and p_goods_fmv > 0 then greatest(0, p_amount - p_goods_fmv) else null end
    ) returning id into v_donation_id;
    update goods_payments set donation_id = v_donation_id where id = v_goods_id;
  end if;

  return jsonb_build_object(
    'ok', true, 'duplicate', false,
    'goods_payment_id', v_goods_id, 'donation_id', v_donation_id
  );
exception
  when unique_violation then
    -- concurrent save of the same entry: report as duplicate, nothing written twice
    select id into v_existing from goods_payments where payment_key = p_payment_key;
    return jsonb_build_object('ok', true, 'duplicate', true, 'goods_payment_id', v_existing);
end;
$$;

-- A signed receipt link can be explicitly superseded (after an edit made its
-- numbers stale). Per-link, fail-closed: only the exact recorded signature
-- stops rendering; everything else renders as minted.
alter table receipt_corrections add column if not exists superseded_at timestamptz;
