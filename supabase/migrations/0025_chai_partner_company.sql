-- ============================================================
-- CHAI PARTNER COMPANY
-- Company/organization as donor of record for a Chai partnership.
-- Set at first entry; renewal receipts keep it unless specifically
-- changed later. Historical payment rows are never relabeled.
-- ============================================================

alter table public.chai_partners add column if not exists company text;
