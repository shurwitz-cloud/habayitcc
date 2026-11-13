-- Explicit opt-in for ONE verified already-sent receipt signature.
-- Existing date-only corrections remain date-only. No donor data added.
alter table receipt_corrections
  add column if not exists correct_content boolean not null default false;
