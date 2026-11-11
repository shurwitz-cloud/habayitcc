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
## Receipt date fix + exact-link corrections (SHIPPED 2026-10-29)
- main = f57dd4b (squash of reviewed branch receipt-dates-et; squash tree
  byte-identical to the tested branch tree). Production rebuilt on merge and
  serves it (Vercel auto-promote, deploy Ready).
- All donor-facing receipt dates format in America/New_York via
  `src/lib/donations/receipt-date.ts` (was runtime-local; UTC runtimes rolled
  evening gifts to the next day). Receipt page and link builders use it;
  legacy signed links render byte-identical dates.
- Exact-link receipt corrections: `receipt_corrections` table (migration 0020,
  applied to production 2026-10-29; sig + donation UUID only, no donor PII,
  service-role only, RLS enabled, anon/authenticated revoked). Lets an admin
  make ONE already-sent signed link render its payment's real ET date. The
  receipt page checks the verified signature against that table and fails
  closed to the original rendering on any miss, error, or link/donation
  mismatch; every other link is untouched. No email is sent in this flow.
- Admin route `/api/admin/receipt-corrections`: GET dry-run reconstructs the
  original link params + signature for a donation so reconstruction is proven
  against the actually-sent link first; POST records the mapping, refuses a
  mismatched expectedSig, and never rebinds a mapping to another donation.
- First production correction recorded 2026-10-29 for one evening gift:
  dry-run matched the sent link's signature, then a single confirm POST.
  The donor's existing link (unchanged URL) now renders the true ET date;
  admin sent-mail log confirms no new email.
- Admin `correct-donation-paid-at` keeps the donation memo on corrected
  receipt links (shared `bareDonationMemo` helper). No email behavior changed.
- Test state at ship: `npx tsc --noEmit` clean; 37 date/parse/sig/memo unit
  checks pass across UTC/ET/Asia runtime zones; 30 e2e route/table checks
  pass in an isolated mock DB (incl. idempotency, conflict, unauthorized,
  missing-table fail-closed); corrected receipt verified visually on preview
  and again on production after deploy.

- Known pending items: /zeffy redirect restoration (PR #4, offline since the Oct 23 rollback);
  teacher login Hebrew-Adventure-only scoping + office@habayitcc.org all-programs login (not yet
  implemented - /app still lists all four programs); GitHub Actions privacy gate activation
  (paste docs/privacy-gate.workflow.yml via web UI + branch protection; token lacks workflow scope).




## Optional reciprocal spouse link between contacts (SHIPPED 2026-11-01)

- main = squash of reviewed branch spouse-link (PR #9). Production rebuilt on merge and serves it (Vercel auto-promote, deploy Active).
- Adds contacts.spouse_contact_id plus reciprocal link/unlink RPCs. CRM contact details show a SPOUSE row with Link spouse / Change / Unlink.
- Manual linking only: no auto-matching, no backfill, and no effect on donations, emails, or receipts. Linking refuses to replace an existing link silently (banner tells you to unlink first).
- Verified end to end on synthetic contacts in the PR preview (link, reciprocal view, refusal, unlink), test data removed before merge, then production spot-checked after promotion (contacts panel, donations tab, donation form, homepage).
- Rollback: Vercel Instant Rollback to the pre-merge production deployment; SQL: drop the two RPC functions, then drop column spouse_contact_id.





=== Fire on Ice event page (branch fire-on-ice-event, PREVIEW ONLY - not merged) ===
- New paid event 'fire-on-ice' (Fire on Ice - Musical Havdala, Motzei Shabbos Nov 28 2026,
  6:30-8:00 PM, Pines Ice Arena) with new event type 'skate': $20/skater in advance
  ($25 at the door noted in copy), Chai Partner code => $17/skater (all skaters on the
  reservation, vs first-ticket-only on couples), optional sponsor presets, 3% cover-fee.
- Short links: /skate, /fire-on-ice, /fireonice -> /events/register/fire-on-ice.
  Flyer: public/flyers/fire-on-ice.jpg (poster from Shmuel's ChatGPT share).
- New type touches: paid-events config, paid-event-pricing (SkateRegistrationData,
  skateLines), PaidEventForm UI, register actions, event-payment-intent + webhook
  metadata (skaters/member_code/member_discount), persist (details summary, guest
  count, details.skate), paid-event-sheet row + 'Fire on Ice' tab headers,
  event-registration-stats (skate people), event-display fallback (people),
  record-offline-registration, EventDetailDrawer default amount, paid-event-capacity.
- Checks: tsc --noEmit clean; standalone pricing + CRM stats unit tests pass
  (member math, fee math, other event types unchanged).
- NOT done here: Vercel preview visual check, merge, publish. Go-live waits for
  Shmuel's explicit yes. Cursor: do not merge this branch yourself.

## Skate non-skater entry passes + Chai 3% up to 6 people (SHIPPED 2026-11-09)
- main = 1342f40 (squash of reviewed PR #18, branch non-skater-entry-pass).
  Vercel preview build passed on the PR; production rebuilt on merge and the
  live /skate page was pixel-verified after promotion.
- /skate (Fire on Ice) tickets: $7 "Entry pass for non-skaters" stepper,
  independent of $20 skaters; pass-only bookings allowed.
- Chai code: 3% off up to 6 PEOPLE per reservation (was 15% off skaters,
  cumulative 6), $20 skaters first then $7 passes ($19.40 / $6.79); extras
  full price. ONE discounted reservation per member per event: all-or-nothing
  6-slot claim via the existing 0028/0029 RPC, partial claim released,
  neutral "already used" message. No customer-facing limit text.
- Hebrew Adventure code: 3% off one $20 skater, never a pass; Chai wins
  over HA (unchanged non-stacking).
- Passes recorded in registration details, confirmation + office email text,
  Stripe metadata (non_skaters/member_people; legacy member_skaters still
  read by the webhook rebuild), events sheet "Skater Details", CRM guest
  counts (skaters + passes).
- Checkout reconciles expired Chai holds (existing helper) before trusting
  code verification so verify and claim cannot disagree; failed/unknown
  Stripe state fails closed.
- Checks: tsc clean, import audit + privacy gate clean, pricing/PGlite/
  details/sheet/CRM tests pass, Vercel preview build pass, live pixel check.
  NOT covered: real Stripe payment end to end (first paid booking is the
  true check - being watched); offline CRM entry has no pass support.
- Rollback: Vercel Instant Rollback to the pre-merge production deployment.


## Skate discounts: Hebrew Adventure + Chai both 15% (2026-11-09)
- User instruction (WhatsApp, same day): Hebrew Adventure and Chai event
  codes both give 15% off (was 3%). Limits unchanged: HA = one 20-dollar
  skater per code, never a non-skater pass; Chai = up to 6 people per
  reservation, skaters + non-skaters, one discounted reservation per member
  per event. Non-stacking unchanged (Chai still wins over HA).
- New math: HA skater 20.00 -> 17.00; Chai skater 17.00, Chai non-skater
  pass 7.00 -> 5.95.
- Rate constants only: SKATE_HA_DISCOUNT_RATE / SKATE_CHAI_DISCOUNT_RATE
  0.03 -> 0.15 in src/lib/events/paid-event-pricing.ts; UI copy updated.
  Card processing fee (3%) untouched.
- Checks: privacy gate clean; Vercel preview build + live form probe.

## Discount-code retry fix: resume owned checkouts, paid-only "used" (2026-11-09)
- Bug: an unfinished checkout (never charged / card failed) left a reserved
  hold that verification counted as usage, so every retry said "already
  used" and locked the member out (seen live twice tonight on one family).
- Rule (user, WhatsApp): "already used" means a completed PAID registration
  only; unfinished/failed must not block; a processing payment gets an
  accurate in-progress reply, never a false "already used".
- Fix (PR #22, squash 6af0345):
  - Verify counts consumed (paid) holds only - Chai + Hebrew Adventure.
  - Per-request reconcile of the code owner's own holds against live Stripe
    state before verify/claim: succeeded -> consume, canceled/unbound ->
    release, processing/requires_capture -> pending (never canceled),
    unknown/future status -> pending (never canceled).
  - OWNERSHIP GATING: the route sets an httpOnly SameSite=Lax claim-token
    cookie at checkout creation; only a request carrying that token may
    resume or cancel that checkout. A foreign browser's live checkout is
    never canceled - it reads "still in progress, wait a few minutes".
  - RESUME (not cancel) for an owned, unexpired, amount-matching
    still-payable PI: the route re-verifies held code set + event + amount
    (recomputed from the actual held rows), then returns the SAME
    client_secret. No new PI per retry; the leaked-PI loop is gone.
    Amount-mismatch owned retry: requires_payment_method -> cancel_release;
    requires_confirmation/action -> pending, heals at hold expiry.
  - 0-row release/consume RPC writes throw inside reconcile (fail closed);
    per-row expiry heals TTL-expired rows in own-reconcile. NOTE: no cron
    exists - the claim RPCs' 24h expires_at exclusion is the abandonment
    backstop; reconcileExpired* exports remain uncalled legacy.
  - Post-payment reclaim path no longer invites continuing at full price.
- Residual (documented, accepted): if a PI moves to processing between
  retrieve and cancel AND Stripe's rare processing-cancel succeeds, that
  in-flight payment is interrupted (never charged, no double charge
  possible; the payer's next submit heals). Cookie-less cross-device retry
  of an in-flight checkout waits out the 24h TTL with an in-progress
  message.
- Checks: 25/25 tests (PGlite migrations 0028-0030 + Stripe-stubbed seam
  harness incl. resume/race/foreign/unknown-status), tsc clean, privacy
  gate clean, Vercel preview green on the exact merged head, independent
  real-code harness review (18/18) by a second agent, post-deploy live
  read-only verify (HA code confirms 15% off one skater; no "already
  used"). NOT covered: a real paid retry end to end (first real retry is
  being watched).
- Rollback: Vercel Instant Rollback to the pre-merge production deployment.
## Teens BBQ Kickoff event page (PR #19, SHIPPED 2026-11-11)
- New paid event 'teens-bbq' (HaBayit Teens BBQ Kickoff, Sun Nov 22 2026, 6:00 PM,
  Backyard of 3007 Bogota Ave) with new event type 'bbq': $10/person stepper,
  sponsor presets, optional 3% card-fee checkbox. Short links /bbq and /teens-bbq.
- Flyer public/flyers/teens-bbq.jpg is the user-supplied event art (metadata-clean).
- Full standard wiring: Stripe intent + metadata, webhook rebuild (attendees key),
  CRM registration + people mode 'people', events-sheet tab 'Teens BBQ Kickoff',
  confirmation + office emails, offline CRM entry default $10.
- Discounts per Shmuel 2026-11-09: flat $10, NO Chai discount and NO Hebrew
  Adventure codes on this event. Instead: one-time staff codes. Discreet
  'Have a code?' toggle on the form (promo-code style, no eligibility text
  anywhere on the site).
- Staff codes: migration 0031_bbq_staff_codes (bbq_staff_codes table + claim/
  bind/consume/release/resolve RPCs, RLS-locked, dormant-safe fail-closed).
  Each code covers ONE admission exactly once: claim before the Stripe intent
  (never charge without the discount), bind PI, consume on persist (submit or
  webhook path), release only when never charged, expired holds reconcile
  against live Stripe state (mirrors 0029/0030). Free ($0) registrations
  claim+consume in the submit action; the form already hides payment at $0.
- Codes are generated and inserted ONLY by scripts/generate-bbq-staff-codes.mjs
  (10 codes, BBQ-XXXXXXXX, unambiguous alphabet) at go-live with the service
  key: no plaintext codes in the repo. Printout goes to Shmuel privately.
- CONFIRMED by Shmuel 2026-11-11 (WhatsApp "Yes" to the exact question): each
  code = one FREE admission, usable once for this BBQ.
- Checks: tsc --noEmit clean; PGlite isolated staff-code tests 15/15; pricing
  7/7; merged atop main incl. PR #21/#22 skate fixes (15% rates + retry
  resume) with those tests re-run green; Vercel preview green.
  Go-live done 2026-11-11: migration 0031 applied to production, codes
  generated + inserted, page verified live. NOT covered: a real paid BBQ
  checkout end to end (first real registration is being watched).
