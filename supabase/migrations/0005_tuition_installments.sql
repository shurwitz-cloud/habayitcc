-- Payment method preference + scheduled tuition installments (Nov/Dec charges).
alter table families
  add column if not exists payment_method_preference text;

create table if not exists tuition_installments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  installment_number int not null,
  amount numeric(10,2) not null,
  due_date date not null,
  status text not null default 'scheduled',
  stripe_payment_intent_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (family_id, installment_number)
);

create index if not exists idx_tuition_installments_due
  on tuition_installments (due_date, status);
