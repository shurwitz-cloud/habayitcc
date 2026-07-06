# HaBayit — Email Handoff

Use this doc when starting a **new Cursor chat** focused on transactional email.  
Repo: `C:\GitHub\habayitcc` · Production: **https://www.habayitcc.org** (Vercel + Resend + Supabase)

---

## Status (as of Jul 2026)

| Area | Status |
|------|--------|
| Resend integration | **Live** — all major forms send email |
| Provider | [Resend](https://resend.com) via `resend` npm package |
| Templates | Inline HTML in `src/lib/email/*.ts` (no React Email / MJML yet) |
| Admin notifications | Sent to `ADMIN_NOTIFICATION_EMAIL` (falls back to from-address) |

**Important fix already applied:** Server actions use `await sendEmail(...)` (not `void sendEmail(...)`). Fire-and-forget was causing emails to be dropped when the serverless function exited early.

---

## Environment variables (Vercel Production + Preview)

| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY` | Resend API key — **required** or all sends are skipped |
| `RESEND_FROM_EMAIL` | Verified sender, e.g. `info@habayitcc.org` |
| `ADMIN_NOTIFICATION_EMAIL` | Where admin copies go (contact, RSVP, registrations, Chai Partner). Defaults to `RESEND_FROM_EMAIL` if unset |
| `NEXT_PUBLIC_SITE_URL` | Links in emails (receipts, buttons). Should be `https://www.habayitcc.org` |

Set via Vercel dashboard or `npx vercel env ls`.

If `RESEND_API_KEY` is missing, `sendEmail()` logs a warning and returns `false` — **the form may still succeed** (data saved to Supabase) but no email goes out.

---

## Architecture

```
src/lib/email/
├── client.ts              ← Resend client, sendEmail(), buildEmailHtml(), shared header/footer shell
├── submissions.ts         ← Registry of all submission emails (SUBMISSION_EMAILS map)
├── contact.ts
├── rsvp-confirmation.ts
├── donation-receipt.ts
├── chai-partner-welcome.ts
├── registration-received.ts
└── registration-accepted.ts
```

### Shared shell (`client.ts`)

- **From:** `HaBayit Jewish Center <RESEND_FROM_EMAIL>`
- **Design:** Navy header bar, gold accents, cream outer background, logo from `{SITE_URL}/logos/habayit-logo-white.png`
- **Helpers:** `buildEmailHtml(body)`, `emailButton(href, label)`, `getAdminEmail()`, `getSiteUrl()`

### Adding a new email

1. Create `src/lib/email/your-template.ts` with a `sendXxxEmail()` function using `buildEmailHtml` + `sendEmail`.
2. Register it in `submissions.ts` → `SUBMISSION_EMAILS`.
3. Call it from the form’s server action **after** DB save succeeds, with **`await`**.
4. Deploy; test with `/api/email/health?send=you@example.com`.

---

## Email catalog

| ID | User receives | Admin receives | Trigger |
|----|---------------|----------------|---------|
| **contact** | Thank-you | Full message + reply-to set to user | `src/app/contact/actions.ts` → `submitContactForm` |
| **rsvp** | RSVP confirmation + event details | RSVP summary | `src/app/rsvp/[slug]/actions.ts` → `submitRsvp` |
| **donation_one_time** | Tax receipt link | — | `src/app/donate/actions.ts` → after Stripe payment + DB record |
| **donation_monthly_start** | Thank-you + receipt (monthly wording) | — | Same donate action, `donationType: 'Monthly'` |
| **donation_monthly_renewal** | Tax receipt each charge | — | `src/app/api/webhooks/stripe/route.ts` → `invoice.payment_succeeded` |
| **chai_partner** | Welcome + **access code** + partner tone; signed “Rabbi Shmuly & Devora” | New partner details | `src/app/chai-partner/actions.ts` → after Stripe subscription confirmed |
| **hebrew_adventure_registration** | “Pending review” + payment plan summary; **not charged until accepted** | New registration alert + admin link | `src/app/hebrew-adventure/register/actions.ts` |
| **hebrew_adventure_accepted** | Acceptance + amount charged + installment schedule | — | `src/app/admin/registrations/actions.ts` → `acceptRegistration` |

Full registry (with handler names): `src/lib/email/submissions.ts`.

---

## Tone & copy notes

- **Chai Partner welcome** — partner/gratitude focused, not generic receipt tone. Signature: **Rabbi Shmuly & Devora** (not “The HaBayit Team”).
- **Hebrew Adventure registration** — warm, “pending review,” explicitly states card is on file but **not charged until acceptance**.
- **Hebrew Adventure accepted** — includes installment schedule and ACH processing note.
- **Donation receipts** — link to `/receipt?...` (signed URL via `src/lib/donations/receipt-url.ts`).

---

## Testing

### 1. Health check (no auth)

```
GET https://www.habayitcc.org/api/email/health
GET https://www.habayitcc.org/api/email/health?send=your@email.com
```

Returns `{ configured, hasApiKey, fromEmail, sent }`.

### 2. Visual shell preview

```
GET https://www.habayitcc.org/email-preview
```

Shows sample RSVP-style email in the shared shell (dev-style route, not a full template gallery).

### 3. End-to-end

Submit each live form on production (contact, RSVP, donate test mode, etc.) and confirm both user + admin inboxes.

---

## Resend / domain checklist

- Sending domain **`habayitcc.org`** must be verified in Resend (DNS records).
- `RESEND_FROM_EMAIL` must use that verified domain (e.g. `info@habayitcc.org`).
- Site canonical URL is **`www.habayitcc.org`** — set `NEXT_PUBLIC_SITE_URL` accordingly so receipt/button links match.

---

## Known gaps & improvement ideas

| Item | Notes |
|------|-------|
| Return values ignored | Most actions `await` send but don’t fail the form if `sendEmail` returns `false`. Consider surfacing “saved but email failed” or retry queue. |
| Footer link hardcoded | `client.ts` footer still links to `habayitcc.org` in one place; `getSiteUrl()` used elsewhere — could unify to `www.habayitcc.org`. |
| No template preview UI | Editing requires code change + deploy. Could add `/admin/email-preview` or React Email later. |
| No unsubscribe | Transactional only today; fine for receipts/confirmations. Needed if marketing blasts added. |
| `HANDOFF.md` root file | **Outdated** — still says “No Resend emails wired in”. This doc supersedes that section for email. |
| Google Sheets | Contact (and possibly other) forms also append to Sheets **best-effort** (`void`) — separate from email. |

---

## Related files (outside `src/lib/email/`)

| File | Role |
|------|------|
| `src/app/api/webhooks/stripe/route.ts` | Recurring donation receipt emails |
| `src/app/admin/registrations/actions.ts` | Acceptance email after charge |
| `src/lib/donations/receipt-url.ts` | Signed receipt URLs in donation emails |
| `public/email-preview.html` | Static legacy preview (prefer `/email-preview` route) |

---

## Quick prompts for a new chat

Paste this when opening an **Emails** chat:

> HaBayit Next.js at `C:\GitHub\habayitcc`. Read `docs/handoff-emails.md`. Production on Vercel, Resend for email, Supabase for data. Focus: [your task — e.g. “fix contact admin copy” / “add bar mitzvah inquiry email” / “emails not arriving for RSVP”].

---

## Do not change without discussion

- Switching away from Resend (already configured on Vercel).
- Removing admin notification copies (staff rely on them).
- Changing Chai Partner access code email without updating registration flow docs.
