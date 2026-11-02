-- ============================================================
-- GOODS / SERVICES / CLASSES PAYMENTS (non-donation)
-- Payments for goods or services (mezuzot, Bar Mitzvah classes,
-- Torah study classes, etc.). These are NOT tax-deductible
-- donations: they never join the donations table, and they stay
-- out of the year-end donation summary unless a row is
-- explicitly flagged include_in_year_end (listed separately as
-- non-deductible). A ledger row in payments (source_type
-- 'goods_payment') keeps "all money in" reporting whole.
-- ============================================================

create table if not exists goods_payments (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  item_label text not null, -- 'Bar Mitzvah Classes', 'Torah Study Classes', 'Mezuzot', or custom
  quantity integer not null default 1,
  unit_amount numeric(10,2) not null,
  amount numeric(10,2) not null, -- total received (quantity x unit_amount)
  payment_method text, -- 'Zelle', 'Cash', 'Check #123', ...
  memo text,
  payment_key text unique, -- dedupe key, e.g. manual:goods-...
  -- Admin opt-in: include on the year-end statement (always as a
  -- separate, clearly non-deductible section). Default off.
  include_in_year_end boolean not null default false,
  receipt_emailed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_goods_payments_email on goods_payments(email);
create index if not exists idx_goods_payments_paid_at on goods_payments(paid_at);

-- Same posture as every other CRM table: service role only.
alter table goods_payments enable row level security;
