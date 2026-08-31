-- Offline / manual Chai (and other) ledger details for CRM.
alter table payments
  add column if not exists payment_method text;

alter table payments
  add column if not exists coverage_months integer;

comment on column payments.payment_method is
  'Human label: Zelle, Cash, HaBayit donation link, Credit Card, …';
comment on column payments.coverage_months is
  'How many Chai months this payment covers (null/1 = one month).';
