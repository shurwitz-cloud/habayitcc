-- Store Stripe customer + saved payment method on the family for tuition billing.
alter table families
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_payment_method_id text;

create index if not exists idx_families_stripe_customer
  on families (stripe_customer_id)
  where stripe_customer_id is not null;
