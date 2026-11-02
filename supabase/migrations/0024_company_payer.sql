-- ============================================================
-- COMPANY / ORGANIZATION PAYER (all entry types)
-- Optional company on the payment record and the contact. When
-- set, receipts are issued to the company name; the person stays
-- the contact. NULL on every existing row: nothing historical
-- changes.
-- ============================================================

alter table donations add column if not exists company text;
alter table goods_payments add column if not exists company text;
alter table contacts add column if not exists company text;

-- Replace the 0023 signature outright: without this drop the old
-- 15-parameter overload stays alongside the new one and every call
-- becomes ambiguous.
drop function if exists record_goods_payment_tx(text,text,text,text,text,integer,numeric,numeric,text,text,text,timestamptz,boolean,boolean,numeric);

-- Goods recording: carry company onto the goods row and the linked
-- donation row (when "Add as a donation" is checked). Same
-- transaction, same duplicate behavior as before; new parameter
-- defaults to null so existing callers are unaffected.
create or replace function record_goods_payment_tx(
  p_first_name text, p_last_name text, p_email text, p_phone text,
  p_item_label text, p_quantity integer, p_unit_amount numeric, p_amount numeric,
  p_payment_method text, p_memo text, p_payment_key text, p_paid_at timestamptz,
  p_include_in_year_end boolean, p_include_as_donation boolean,
  p_goods_fmv numeric default null,
  p_company text default null
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
    include_in_year_end, include_as_donation, paid_at, company
  ) values (
    trim(p_first_name), trim(p_last_name), lower(trim(p_email)), nullif(trim(p_phone), ''),
    trim(p_item_label), greatest(1, p_quantity), p_unit_amount, p_amount,
    p_payment_method, nullif(trim(p_memo), ''), p_payment_key,
    p_include_in_year_end, p_include_as_donation, coalesce(p_paid_at, now()),
    nullif(trim(p_company), '')
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
      goods_payment_id, goods_description, goods_fmv, deductible_amount, company
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
      case when p_goods_fmv is not null and p_goods_fmv > 0 then greatest(0, p_amount - p_goods_fmv) else null end,
      nullif(trim(p_company), '')
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

-- Reclassification carries company with the payment, both directions.
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
        goods_payment_id, goods_description, goods_fmv, deductible_amount, company
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
          else null end,
        v_goods.company
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
        payment_key, include_in_year_end, paid_at, company
      ) values (
        v_don.first_name, v_don.last_name, v_don.email, v_don.phone,
        coalesce(p_goods_item_label, 'Other'), 1, v_don.amount, v_don.amount,
        v_ledger.payment_method, v_don.memo, p_payment_key,
        p_include_in_year_end, coalesce(v_ledger.paid_at, v_don.created_at),
        v_don.company
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
