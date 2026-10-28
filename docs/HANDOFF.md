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
