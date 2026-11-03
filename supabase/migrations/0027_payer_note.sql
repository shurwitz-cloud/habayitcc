-- ============================================================
-- 0027: ORIGINAL PAYER NOTES (internal, verbatim)
--
-- The payer's own words exactly as written - the memo line on a
-- check, a Zelle memo, a Zeffy comment, a website note - stored
-- SEPARATELY from donations.memo / goods_payments.memo, which
-- carry the admin's receipt wording. Internal/admin-only: never
-- rendered on receipts and never emailed. NULL on every existing
-- row; historical values are filled only by an admin-reviewed
-- backfill, never inferred or generated.
-- ============================================================

alter table donations add column if not exists payer_note text;
alter table goods_payments add column if not exists payer_note text;
alter table payments add column if not exists payer_note text;

-- ------------------------------------------------------------
-- record_goods_payment_tx: carry payer_note onto the goods row,
-- the single ledger row, and the optional linked donation row.
-- Drop the 0024 overload so calls stay unambiguous.
-- ------------------------------------------------------------
drop function if exists record_goods_payment_tx(text,text,text,text,text,integer,numeric,numeric,text,text,text,timestamptz,boolean,boolean,numeric,text);

create or replace function record_goods_payment_tx(
  p_first_name text, p_last_name text, p_email text, p_phone text,
  p_item_label text, p_quantity integer, p_unit_amount numeric, p_amount numeric,
  p_payment_method text, p_memo text, p_payment_key text, p_paid_at timestamptz,
  p_include_in_year_end boolean, p_include_as_donation boolean,
  p_goods_fmv numeric default null,
  p_company text default null,
  p_payer_note text default null
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
    include_in_year_end, include_as_donation, paid_at, company, payer_note
  ) values (
    trim(p_first_name), trim(p_last_name), lower(trim(p_email)), nullif(trim(p_phone), ''),
    trim(p_item_label), greatest(1, p_quantity), p_unit_amount, p_amount,
    p_payment_method, nullif(trim(p_memo), ''), p_payment_key,
    p_include_in_year_end, p_include_as_donation, coalesce(p_paid_at, now()),
    nullif(trim(p_company), ''), nullif(trim(p_payer_note), '')
  ) returning id into v_goods_id;

  insert into payments (
    source_type, source_id, amount, stripe_payment_intent_id, payment_method, status, paid_at, payer_note
  ) values (
    'goods_payment', v_goods_id, p_amount, p_payment_key, p_payment_method, 'succeeded',
    coalesce(p_paid_at, now()), nullif(trim(p_payer_note), '')
  );

  if p_include_as_donation then
    insert into donations (
      first_name, last_name, email, phone, amount,
      stripe_payment_intent_id, status, donation_type, memo, created_at,
      goods_payment_id, goods_description, goods_fmv, deductible_amount, company, payer_note
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
      nullif(trim(p_company), ''),
      nullif(trim(p_payer_note), '')
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

-- ------------------------------------------------------------
-- edit_payment: whitelist payer_note (donations, goods, ledger).
-- Same body as 0023 with the one field added in all three places.
-- ------------------------------------------------------------
create or replace function edit_payment(
  p_payment_key text,
  p_changes jsonb, -- { field: newValue }; allowed: first_name,last_name,email,phone,amount,memo,payer_note,paid_at,payment_method,campaign
  p_created_by text default null,
  p_note text default null
) returns jsonb language plpgsql as $$
declare
  v_don donations%rowtype;
  v_goods goods_payments%rowtype;
  v_old jsonb := '{}';
  v_field text;
  v_allowed text[] := array['first_name','last_name','email','phone','amount','memo','payer_note','paid_at','payment_method','campaign','item_label','include_in_year_end'];
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
          when 'payer_note' then update donations set payer_note = (p_changes->>v_field) where id = v_don.id;
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
          when 'payer_note' then update goods_payments set payer_note = (p_changes->>v_field) where id = v_goods.id;
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
    payer_note = coalesce(p_changes->>'payer_note', payer_note),
    paid_at = coalesce((p_changes->>'paid_at')::timestamptz, paid_at)
  where stripe_payment_intent_id = p_payment_key;

  insert into entry_audit_log (payment_key, action, changes, note, created_by)
  values (p_payment_key, 'edit', jsonb_build_object('from', v_old, 'to', p_changes), p_note, p_created_by);

  return jsonb_build_object('ok', true);
end;
$$;
