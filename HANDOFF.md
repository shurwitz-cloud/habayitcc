# HaBayit Next.js Rebuild — Project Handoff

## Context for Claude in Cursor

This is the HaBayit Jewish Center website, being rebuilt from a static HTML site into Next.js. This document gives you full context on what's been built, decisions made, and what's left to do. Read this fully before making changes.

---

## Project Background

HaBayit Jewish Center (Cooper City, FL) had a static HTML/CSS/JS website hosted on GitHub Pages at `habayitcc.org`. We are rebuilding it into a proper Next.js application for long-term maintainability, while preserving the exact visual design (navy/gold/cream palette, Cormorant Garamond + Inter + Frank Ruhl Libre fonts).

**This is a multi-year project.** Architectural decisions favor maintainability and scalability over quick wins. Do NOT build features that aren't needed yet — but DO structure the code so they can be added later without rearchitecting.

---

## Tech Stack (Decided, Do Not Change)

- **Next.js** (App Router, TypeScript)
- **GitHub** for version control — repo `habayitcc`, working on branch `nextjs-rebuild` (do NOT touch `main`, which still serves the live static site)
- **Vercel** for hosting (connected, not yet deployed from this branch)
- **Supabase** for database (connected; schema migrated, see below)
- **Stripe** for payments — TEST MODE ONLY until fully approved. No live keys yet. Must use embedded Stripe Elements, never payment links.
- **Resend** for transactional email (account exists, not yet wired into code)
- **Tailwind CSS v4** (uses `@theme` in globals.css, no separate tailwind.config.js)

**Explicitly rejected:** Firebase, Google Apps Script, Google Sheets as primary database (Sheets may be used later as an optional export only).

---

## What's Been Built (Phase 1 + Phase 2 — Complete)

### Design tokens (`src/app/globals.css`)
Color variables: `--color-navy: #172643`, `--color-gold: #b8902a`, `--color-cream: #f7f3ea`, etc. Mirrors the original static site exactly.

### Fonts (`src/app/layout.tsx`)
Cormorant Garamond (display/headings), Inter (body), Frank Ruhl Libre (Hebrew accents, used sparingly per design direction — no large decorative Hebrew blocks).

### Reusable components (`src/components/`)
- `layout/Header.tsx` — nav with Programs dropdown (HaBayit Hebrew Adventure, Bar & Bat Mitzvah) and Donate dropdown (Make a Donation, Become a Chai Partner), mobile menu
- `layout/Footer.tsx` — Explore/Programs/Contact columns
- `sections/Hero.tsx` — reusable page-top banner
- `sections/Section.tsx` — `Section` + `SectionTitle`, consistent spacing rhythm
- `sections/ProgramCard.tsx` — `ProgramCard` (small tiles) + `ProgramTile` (large feature tiles), used on homepage
- `ui/Button.tsx` — `Button` (in-page actions) + `LinkButton` (navigation), gold/outline-navy/outline-light variants

### Pages built (all in `src/app/`)
| Route | Status | Notes |
|---|---|---|
| `/` (homepage) | ✅ Done | Hero, Explore grid (HaBayit Hebrew Adventure tile, Bar/Bat Mitzvah/Chai Partner cards, Synagogue tile), mission statement, events teaser, contact strip |
| `/about` | ✅ Done | Mission, founders' story (Rabbi Shmuly & Devora Hurwitz bios), values grid |
| `/synagogue` | ✅ Done | Shabbat schedule (Friday L'chaim/Kabbalat Shabbat, Saturday Shacharit/Kiddush/Mincha), what to expect |
| `/hebrew-adventure` | ✅ Done | Program overview, 3 pillars, pricing ($1,100 standard / $1,000 Chai Partner), links to `/hebrew-adventure/register` |
| `/hebrew-adventure/register` | ✅ Done | Full multi-child registration form — see "Registration Form Details" below |
| `/bar-bat-mitzvah` | ✅ Done | Landing page with two clickable panels (whole panel is the link, no separate buttons) |
| `/bar-mitzvah` | ✅ Done | HaBayit BMX placeholder — 7th grade boys, 3 pillars |
| `/bat-mitzvah` | ✅ Done | HaBayit Bloom placeholder — 6th grade girls, 3 pillars |
| `/donate` | ✅ Done | One-Time/Monthly toggle, amount grid ($72/$180/$360/$770/$1,800/Other), Chai Partner CTA below |
| `/chai-partner` | ✅ Done | Amount grid ($150-$1,800/Other, $150 minimum), full signup form, generates access code on submit |
| `/events` | ✅ Done | Static event list (3 sample events) |
| `/contact` | ✅ Done | Contact form wired to Supabase via Server Action |

### Supabase schema (`supabase/migrations/0001_initial_schema.sql`)
15 tables: `families`, `parents`, `children`, `programs`, `program_registrations`, `events`, `event_registrations`, `donations`, `chai_partners`, `payments`, `contacts`, `email_subscribers`, `staff_notes`, `attendance`, `waivers`, `sponsors`.

Key design decisions:
- `programs` is generic (HaBayit Hebrew Adventure, Bar Mitzvah Club, Bat Mitzvah Club are *rows*, not separate tables) so future programs don't need schema changes
- `donations` and `chai_partners` are separate (one-time vs. recurring lifecycle)
- `payments` is a unified ledger across all payment sources
- `waivers` and `staff_notes` use generic `notable_type`/`notable_id` pattern
- RLS is NOT enabled yet (no auth in Phase 1/2) but schema is structured so it can be added later without restructuring

### TypeScript types (`src/types/database.ts`)
Hand-written types mirroring the schema. **Important quirk resolved:** every interface has a `[key: string]: unknown;` index signature, and the `Database` interface has a `__InternalSupabase: { PostgrestVersion: '13' }` key — both required for `@supabase/supabase-js`'s generic type inference to work correctly with this schema shape. Without these, `.insert()` calls incorrectly infer as `never[]`.

### Supabase clients (`src/lib/supabase/`)
- `client.ts` — browser client for Client Components
- `server.ts` — `createClient()` for Server Components (cookie-based, ready for future auth), `createAdminClient()` using the service role key for Server Actions that need to write data without a user session (e.g. public form submissions)

### Registration Form Details (`/hebrew-adventure/register`)
This is the most complex page. Built as:
- `page.tsx` — wrapper with Hero + Section
- `RegistrationForm.tsx` — client component, all form state, supports adding/removing children dynamically, sibling discount calculation ($50 off 2nd child, $75 off 3rd+), Jewish status + conversion org/rabbi fields per parent, Chai Partner code field (shown conditionally), payment plan selection, policy agreement checkboxes
- `actions.ts` — Server Action `submitHebrewSchoolRegistration()` — verifies Chai Partner code against `chai_partners` table, creates `families` → `parents` → `children` → `program_registrations` → `waivers` records

**Important field naming note:** the form asks "Was your child born before or after sunset?" with a small inline hint "(for Hebrew birthday)" — this determines `born_before_sunset` in the `children` table, used for Hebrew birthday calculation (Jewish day begins at nightfall). Do not remove this field or its explanation.

### Chai Partner signup (`/chai-partner`)
- `page.tsx` — full client component, amount selection + form + generates a unique access code (format `HABAYIT-XXXXXX`) shown on success
- `actions.ts` — Server Action `submitChaiPartnerSignup()` — inserts into `chai_partners` table with `status: 'active'`

**This access code is the bridge between Chai Partner and HaBayit Hebrew Adventure discounts** — when someone registers for HaBayit Hebrew Adventure and checks "I am a Chai Partner," they enter this code, and the registration action verifies it against the `chai_partners.access_code` column before applying the discounted rate.

### Contact form (`/contact`)
Simple Server Action writing to the `contacts` table. No email sent yet (that's Phase 3).

---

## Known Package Version Pin (Important — Do Not Casually Upgrade)

`@supabase/supabase-js` is pinned to `2.46.1` and `@supabase/ssr` to `0.5.2`. **This is intentional, not an oversight.** Newer versions of `@supabase/supabase-js` (2.108.x+) introduced a `__InternalSupabase` typing scheme that has a confirmed bug causing `.insert()` calls to incorrectly infer as `never[]` with hand-written `Database` types like ours. This was reproduced in isolation and confirmed as a library issue, not a schema problem. If upgrading either package in the future, re-verify `npx tsc --noEmit` passes cleanly before committing — if the `never[]` errors return, downgrade back.

---

## What's Explicitly NOT Built Yet (Do Not Add Without Discussion)

- **No CRM integration** (HubSpot, Mailchimp, Airtable) — Supabase is the single source of truth; future CRM should read from Supabase, not duplicate data entry
- **No authentication / login pages** — but the `createClient()` server function is already cookie-aware so auth can be added later without restructuring
- **No Stripe integration yet** — all "Donate Now," "Start Monthly Giving," "Become a Chai Partner" buttons currently either show a placeholder alert or just save to Supabase without charging a card. This is the next major phase.
- **No Resend emails wired in** — Server Actions have `// TODO (Phase 3)` comments marking exactly where email triggers should go (contact confirmation, donation receipt, Chai Partner confirmation, registration confirmation, admin notification)
- **No Gallery page**
- **No admin dashboard / member portal** — future feature, not yet started

---

## Immediate Known Issues to Fix

(User: list your current problems here for Cursor to address first)

---

## Workflow Notes

- The user is on Windows, working in Cursor, with the project at `C:\GitHub\habayitcc`
- GitHub Desktop is also installed and has been used for commits/pushes in the past — either tool can be used for git operations going forward, user's preference
- Previously hit a `.git` permission error when the repo was inside OneDrive — the repo was moved to `C:\GitHub\habayitcc` (NOT inside OneDrive) specifically to avoid this; do not suggest moving it back
- The user is non-technical but capable of following precise step-by-step instructions and running terminal commands when given exact text to type
- Prior to this Next.js rebuild, a full static HTML/CSS/JS site was built and is still live at `habayitcc.org` via GitHub Pages from the `main` branch — that original static version's files are described in earlier project history but are not part of this Next.js codebase

---

## Design Direction (Carry Forward)

- Warm, clean, premium — not corporate, not cluttered
- Mostly cream/white/navy with subtle gold accents
- Minimal, tasteful Hebrew (small accent text, never large decorative blocks)
- No emoji icons (one exception: a 📅 calendar emoji on the HaBayit Hebrew Adventure page schedule note — flagged here in case it should be replaced with an icon component later)
- Real photography placeholders throughout (gradient + "Photography Coming Soon" label) — site owner will provide real photos later
- Logo: `הבית` (Hebrew) stacked above "JEWISH CENTER" in the header brand mark
- Every Chai Partner link site-wide should go directly to `/chai-partner` — no intermediate landing pages
