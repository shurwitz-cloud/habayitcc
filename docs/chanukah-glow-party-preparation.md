# Chanukah Glow Party, prepared locally only

Base verified November 18, 2026: production Vercel dashboard showed main commit 27eb61db0889b8ef7a4ad7e8db1259be97d7100c. These changes are based on that exact commit. Recheck current production and main before applying.

## Event
- Chanukah Glow Party for middle schoolers
- Wednesday, December 9, 2026, 6:30 PM America/New_York
- 3007 Bogota Ave
- $15 admission
- Proposed short path: /glow. This path is not live.
- Supplied flyer retained without editing.

## Registration
- Name, email, phone and quantity
- Optional sponsorship presets $54, $72, $180, $360 or Other
- Optional 3% processing-fee checkbox
- Fixed $10 Chai partner admission, one paid reservation per member per event, maximum two discounted admissions; extras $15. No public limit copy.
- No gift cards created or offered. Topgolf gift cards unchanged.
- Hebrew Adventure codes and all other discounts are disabled per the November 18, 9:53 PM voice instruction. No percentage discount is shown.

A new admission event type reuses the existing discount verification, ownership/hold/retry and persistence path. Internal skate payload keys remain for compatibility; public wording, CRM notes, email details and sheet headers use admission/attendees. Unsupported non-skater entries and unapproved Hebrew Adventure codes are rejected server-side.

## Isolated checks
- TypeScript check passes.
- All 35 pre-existing regression tests and two new Glow-specific pricing/atomic two-slot tests pass.
- 12 event configuration/pricing assertions pass.
- 17 persistence/metadata recovery/CRM-contact/ledger/sheet/receipt/email assertions pass with all external effects replaced by test doubles and network forbidden.
- 18 payment-intent assertions pass with Stripe and database replaced by test doubles and network forbidden.
- 504 old-event pricing combinations exactly match the original production-source calculation.
- Desktop and mobile screenshots inspected. No clipping or horizontal overflow, flyer fully shown, no gift cards or skating copy. Chai field expands.

## Remaining before live
- Explicit private-test deployment approval, then separate final publication approval. Neither is supplied by the discount voice note.
- Recheck main and production before pushing, preserve unrelated pending work.
- Full Next build was not verified here. Local dev startup/compile failed under local resource/tooling limits. Screenshots instead use the actual page and form bundled with inert payment/actions and fallback fonts. They are not proof of hosted runtime behavior.
- Verify private hosted build and current configured service wiring under approved scope. Isolated tests do not prove live Stripe, CRM, sheet or email access/delivery.
- Sheet tab is configured as Chanukah Glow Party and is created on first successful append, not pre-created by this preparation.
- First real registration must be reconciled across Stripe, CRM, sheet, confirmation and office notification after live.

User evidence recovered: November 9, 22:21:28 WhatsApp instruction says charged and submitted before a code counts as used. November 3, 21:40:52 says surname also qualifies for identity matching, in response to member/spouse email/phone/full-name matching proposal. Existing retry/ownership rules retained: never treat abandoned/failed checkout as used, never cancel someone else's live checkout.

No changes were pushed, committed, saved online, deployed or published. No real charge, registration or email was created. Tuition charging code and held CRM work were not changed.
