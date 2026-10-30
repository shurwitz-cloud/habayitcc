# Source / test / live handoff (2026-10-28)

## What this branch is
`integrated-preview-clean` - single-commit privacy-clean integration for
PREVIEW testing only. Not a production migration vehicle. Production go-live
needs a shared source/history plan that keeps Cursor in sync and user review.

## Source state
- Live production (www.habayitcc.org) = Vercel CLI deploy from Oct 22 local
  work; it was never pushed. This branch's tree = that live source, recovered
  from the deployment, plus:
  - invoice family data moved to `SHVILY_INVOICE_JSON` env var (Vercel,
    Production + Preview); code degrades to "unavailable" without it
  - spent admin repair tools parameterized (no hardcoded member lists/names)
  - signed payment-receipt feature (`/payment-receipt`, signing lib,
    admin link generator)
- Repo history on other branches predating this work contains member emails
  and names. Do not merge or rebase this branch onto that history.

## Test state
- `npx tsc --noEmit` clean
- Privacy gate CLEAN (see docs/PRIVACY-GATE.md)
- Preview URL: see Vercel deployments for this branch (SSO-gated)

## Live baseline for regression comparison
- Production: https://www.habayitcc.org
- Preview must match production behavior except: invoice data source (env),
  parameterized repair tools, added payment-receipt page.
- KNOWN pre-existing issue: homepage has a small horizontal-scrollbar
  overflow (present on live and previews identically - do not "fix" silently).
- Admin CRM/attendance//app GET loaders WRITE to the production DB. Never
  load them from a preview that shares production env. Test allowlist:
  /, /events, /donate, /invoice/*, /payment-receipt. No form submissions.

## Sync status (SHIPPED 2026-10-28)
- main = e222c9a (squash atop f273aed). Its tree is byte-identical to the tested
  integrated-preview-clean branch (c47d46f) and to what production serves
  (Vercel deployment dpl_AFYn6qd3M2U4DuGgkaUZX7eEkT9n, auto-promoted on build).
- Reviewed in two layers: (1) old main -> restored-live tree = the code production already ran
  (public pages verified byte-identical vs live); (2) restored tree -> integrated branch = the small
  reviewed delta (receipt feature, invoice env relocation, privacy scrubs, EXIF-stripped photos,
  gate, docs, mobile fit).
- Cursor handoff: `git pull` on main; working tree then matches live; commit normally.
- Rollback: Vercel Instant Rollback to dpl_B2qJZ4BcSASyVAgbbYYNjcjWHGbg (retained, READY).
## Pending review (branch receipt-dates-et, not yet pushed)
- Receipt date timezone fix: all donor-facing receipt dates now format in
  America/New_York via `src/lib/donations/receipt-date.ts` (was runtime-local;
  UTC runtimes rolled evening gifts to the next day). Receipt page/link
  builders use it; legacy signed links render byte-identical dates.
- Exact-link receipt corrections: a new `receipt_corrections` table
  (migration 0020; sig + donation UUID only, no donor PII, service-role only)
  lets an admin make ONE already-sent signed link render its payment's real
  ET date. The receipt page checks the verified signature against that table
  and fails closed to the original rendering on any miss, error, or
  link/donation mismatch; every other link is untouched.
- New admin route `/api/admin/receipt-corrections`: GET dry-run reconstructs
  the original (UTC-dated) link params + signature for a donation so the
  reconstruction can be proven against the actually-sent link first; POST
  records the mapping, refuses when a provided expectedSig does not match,
  and never overwrites a mapping bound to a different donation. No email is
  sent anywhere in this flow.
- Admin `correct-donation-paid-at` now keeps the donation memo on corrected
  receipt links (shared `bareDonationMemo` helper). No email behavior changed.
- Apply order at deploy: run migration 0020, deploy, then record any
  correction via the admin route (dry-run first against the sent link's sig).
- Verify: `npx tsc --noEmit`; date/parse/sig/memo/correction behavior tests
  (see PR notes).

- Known pending items: /zeffy redirect restoration (PR #4, offline since the Oct 23 rollback);
  teacher login Hebrew-Adventure-only scoping + office@habayitcc.org all-programs login (not yet
  implemented - /app still lists all four programs); GitHub Actions privacy gate activation
  (paste docs/privacy-gate.workflow.yml via web UI + branch protection; token lacks workflow scope).
