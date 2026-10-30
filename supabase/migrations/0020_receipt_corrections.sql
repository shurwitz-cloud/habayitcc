-- Corrections that make one specific already-sent signed receipt link render
-- corrected facts (e.g. the real ET payment date) for one specific donation.
-- Keyed by the link's HMAC signature (hex digest, not reversible to donor
-- data) plus the donation UUID. No donor PII is stored here.
-- Service-role server code is the only caller; browser roles get no access.

create table if not exists receipt_corrections (
  id uuid primary key default gen_random_uuid(),
  original_sig text not null unique,
  donation_id uuid not null references donations(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table receipt_corrections enable row level security;
revoke all on table receipt_corrections from anon, authenticated;
