-- ============================================================
-- OPTIONAL EMAIL FOR ADMIN MANUAL ENTRY (one-time donations only)
-- Offline gifts (Zelle/cash/check) sometimes arrive with no payer email.
-- Dropping NOT NULL lets the admin manual-entry flow record them with a
-- NULL email. Online flows (Stripe/Zeffy checkout) always supply an email,
-- and every receipt/email path stays blocked while email IS NULL.
-- App-level guards (manual-entry route) still REQUIRE email for monthly,
-- Chai Partner and Goods/Services entries; only one-time donations may be
-- saved email-less.
-- ROLLBACK (additive-compatible, no payment deletion): fill or remove the
-- NULL email values first, then:
--   alter table donations alter column email set not null;
--   alter table contacts alter column email set not null;
--   alter table goods_payments alter column email set not null;
-- ============================================================

alter table donations alter column email drop not null;
alter table contacts alter column email drop not null;
alter table goods_payments alter column email drop not null;
