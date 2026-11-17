/**
 * No-charge end-to-end coverage for the Topgolf Chanukah Kickoff event:
 *  A. Event config + pricing wiring (real modules)
 *  B. Payment-intent route: $20 math reaches Stripe create; code claim is event-scoped
 *  C. Submit action: free gift-card path claims/persists/consumes in order
 *  D. Persist pipeline: CRM registration row, events-sheet append, confirmation
 *     email, receipt URL, code consume - all captured, nothing real
 *  E. Webhook metadata rebuild for the new event
 *  F. Migration 0033 against a real local Postgres (pglite, when installed):
 *     same code string reusable per event with independent state, legacy
 *     function pinned to BBQ, contention/idempotency, rollback steps.
 *
 * All external effects (Stripe, Supabase prod, Sheets, email) are stubs.
 * Run: node scripts/test-topgolf-e2e.cjs
 * Part F needs: npm i --no-save @electric-sql/pglite
 */
const fs = require('fs'), vm = require('vm'), ts = require('typescript'), assert = require('node:assert/strict');

function load(file, stubs) {
  let exports = {};
  const sandbox = {
    exports, console, crypto: require('crypto'), process, URL, Buffer, setTimeout,
    require: (k) => { if (!(k in stubs)) throw Error('unstubbed import: ' + k); return stubs[k]; },
  };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    sandbox,
  );
  return exports;
}

let count = 0;
async function test(name, fn) { await fn(); console.log('PASS', ++count, name); }

(async () => {
  // ---------- A. Real config + pricing ----------
  const events = load('src/lib/events/paid-events.ts', {});
  const pricing = load('src/lib/events/paid-event-pricing.ts', { '@/lib/events/paid-events': events });

  const ev = events.getPaidEvent('teens-topgolf');
  await test('event config: slug/type/price/sheet tab', async () => {
    assert.equal(ev.type, 'bbq');
    assert.equal(ev.ticketPrice, 20);
    assert.equal(ev.sheetTab, 'Topgolf Chanukah Kickoff');
    assert.equal(events.paidEventSharePath(ev), '/topgolf');
  });
  await test('pricing: 3 attendees = $60', async () => {
    const p = pricing.computePaidEventTotal({ event: ev, bbq: { attendees: 3 }, sponsorAmount: 0, coverFee: false });
    assert.equal(p.ticketSubtotal, 60); assert.equal(p.total, 60);
  });
  await test('pricing: gift card makes one admission free', async () => {
    const p = pricing.computePaidEventTotal({ event: ev, bbq: { attendees: 3, staffFree: true, staffCode: 'TG-X' }, sponsorAmount: 0, coverFee: false });
    assert.equal(p.ticketSubtotal, 40); assert.equal(p.total, 40);
  });
  await test('pricing: sponsor + 3% card fee', async () => {
    const p = pricing.computePaidEventTotal({ event: ev, bbq: { attendees: 1 }, sponsorAmount: 54, coverFee: true });
    assert.equal(p.ticketSubtotal, 20); assert.equal(p.cardFee, 2.22); assert.equal(p.total, 76.22);
  });
  await test('pricing: bbq-type default is $10 when ticketPrice unset (BBQ legacy default)', async () => {
    assert.equal(events.getPaidEvent('teens-bbq'), undefined); // BBQ event removed 2026-11-17
    const synthetic = { ...ev, slug: 'teens-bbq', ticketPrice: undefined };
    const p = pricing.computePaidEventTotal({ event: synthetic, bbq: { attendees: 2 }, sponsorAmount: 0, coverFee: false });
    assert.equal(p.total, 20);
  });

  // ---------- B. Real payment-intent route ----------
  let piCreate = null, claimArgs = null, bindArgs = null;
  const route = load('src/app/api/stripe/event-payment-intent/route.ts', {
    'next/server': { NextResponse: { json: (body, opt) => ({ body, opt, cookies: { set: () => {} } }) } },
    '@/lib/stripe/server': { stripe: { paymentIntents: { create: async (args) => { piCreate = args; return { id: 'pi_new', client_secret: 'sec' }; }, cancel: async () => ({ status: 'canceled' }) } } },
    '@/lib/donations/normalize-donor': { normalizeDonorEmail: (x) => x.toLowerCase() },
    '@/lib/events/paid-events': events,
    '@/lib/events/paid-event-capacity': { assertPaidEventHasRoom: async () => ({ ok: true }), paidEventUnitsFromInput: () => 2 },
    '@/lib/events/paid-event-pricing': pricing,
    '@/lib/events/hebrew-fair-codes': {},
    '@/lib/events/chai-member-event-codes': {},
    '@/lib/events/skate-allowance': {},
    '@/lib/events/hebrew-fair-code-holds': {},
    '@/lib/events/sync': { ensureEventBySlug: async () => 'event-1' },
    '@/lib/events/bbq-staff-codes': {
      reconcileBbqCheckout: async () => ({ kind: 'available' }),
      verifyBbqStaffCode: async () => ({ supported: true, valid: true, code: 'TG-TESTABCD' }),
      claimBbqStaffCode: async (input) => { claimArgs = input; return { supported: true, claimed: true }; },
      bindBbqStaffCodePayment: async (t, pi) => { bindArgs = { t, pi }; },
      releaseBbqStaffCode: async () => {},
    },
  });
  const req = (b) => ({ json: async () => b, cookies: { get: () => undefined } });

  await test('route: paid intent for 2 attendees = $40 with event metadata', async () => {
    piCreate = null;
    const r = await route.POST(req({ slug: 'teens-topgolf', amountCents: 4000, firstName: 'Test', lastName: 'Person', email: 't@example.invalid', bbq: { attendees: 2 } }));
    assert.equal(r.body.paymentIntentId, 'pi_new');
    assert.equal(piCreate.amount, 4000);
    assert.equal(piCreate.metadata.event_slug, 'teens-topgolf');
    assert.equal(piCreate.metadata.attendees, '2');
  });
  await test('route: gift card claim is scoped to teens-topgolf and PI is $20', async () => {
    piCreate = null; claimArgs = null; bindArgs = null;
    const r = await route.POST(req({ slug: 'teens-topgolf', amountCents: 2000, firstName: 'Test', lastName: 'Person', email: 't@example.invalid', bbq: { attendees: 2, staffCode: 'TG-TESTABCD' } }));
    assert.equal(r.body.paymentIntentId, 'pi_new');
    assert.equal(claimArgs.eventSlug, 'teens-topgolf');
    assert.equal(piCreate.amount, 2000);
    assert.equal(piCreate.metadata.bbq_staff_code, '1');
    assert.equal(JSON.stringify(bindArgs), JSON.stringify({ t: claimArgs.claimToken, pi: 'pi_new' }));
  });
  await test('route: wrong client amount rejected before charge', async () => {
    piCreate = null;
    const r = await route.POST(req({ slug: 'teens-topgolf', amountCents: 9999, firstName: 'T', lastName: 'P', email: 't@example.invalid', bbq: { attendees: 2 } }));
    assert(r.body.error); assert.equal(piCreate, null);
  });

  // ---------- C. Real submit action, free gift-card path ----------
  let actionClaim = null, actionConsume = null, actionRelease = 0, persisted = null;
  const actions = load('src/app/events/register/[slug]/actions.ts', {
    'next/headers': { cookies: async () => ({ get: () => ({ value: 'cookie-tok' }) }) },
    '@/lib/events/paid-event-pricing': pricing,
    '@/lib/events/paid-events': events,
    '@/lib/events/paid-event-capacity': { assertPaidEventHasRoom: async () => ({ ok: true }), paidEventUnitsFromInput: () => 1 },
    '@/lib/events/verify-event-payment': { verifyPaidEventPaymentIntent: async () => ({ ok: true }) },
    '@/lib/events/persist-paid-event-registration': { persistPaidEventRegistration: async (input) => { persisted = input; return { success: true, registrationId: 'reg-1' }; } },
    '@/lib/events/hebrew-fair-codes': {},
    '@/lib/events/chai-member-event-codes': {},
    '@/lib/events/skate-allowance': {},
    '@/lib/events/hebrew-fair-code-holds': {},
    '@/lib/events/sync': { ensureEventBySlug: async () => 'event-1' },
    '@/lib/events/bbq-staff-codes': {
      reconcileBbqCheckout: async (input) => { assert.equal(input.eventSlug, 'teens-topgolf'); return { kind: 'available' }; },
      verifyBbqStaffCode: async (code, tok, slug) => { assert.equal(slug, 'teens-topgolf'); return { supported: true, valid: true, code: 'TG-TESTABCD' }; },
      claimBbqStaffCode: async (input) => { actionClaim = input; return { supported: true, claimed: true }; },
      consumeBbqStaffCode: async (input) => { actionConsume = input; return true; },
      releaseBbqStaffCode: async () => { actionRelease++; },
      bindBbqStaffCodePayment: async () => {},
      getHeldBbqStaffCode: async () => null,
    },
    '@/lib/security/action-rate-limit': { enforceActionRateLimit: async () => ({ ok: true }) },
    '@/lib/supabase/require-write': { assertSupabaseWriteReady: () => ({ ok: true }) },
  });
  await test('submit: free gift-card registration claims(scoped) -> persists $0 -> consumes', async () => {
    const r = await actions.submitPaidEventRegistration({
      slug: 'teens-topgolf', firstName: 'Test', lastName: 'Person', email: 't@example.invalid', phone: '555',
      sponsorAmount: 0, coverFee: false, bbq: { attendees: 1, staffCode: 'TG-TESTABCD' },
    });
    assert.equal(r.success, true);
    assert.equal(actionClaim.eventSlug, 'teens-topgolf');
    assert.equal(actionClaim.code, 'TG-TESTABCD');
    assert.equal(persisted.slug, 'teens-topgolf');
    assert.equal(persisted.bbq.staffFree, true);
    assert.equal(persisted.bbq.staffCode, 'TG-TESTABCD');
    assert.equal(actionConsume.registrationId, 'reg-1');
    assert.equal(actionConsume.claimToken, actionClaim.claimToken);
    assert.equal(actionRelease, 0);
  });

  // ---------- D. Real persist pipeline (CRM + sheet + email captured) ----------
  const inserted = {}, sheetRows = [], emails = [], receipts = [], consumes = [];
  const fakeQuery = (table) => {
    const q = {
      table,
      select: () => q, eq: () => q, ilike: () => q, gte: () => q, order: () => q, limit: () => q,
      update: (u) => { (inserted[table + ':updates'] = inserted[table + ':updates'] || []).push(u); return q; },
      insert: (row) => { (inserted[table] = inserted[table] || []).push(row); return q; },
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: { id: 'reg-test-1' }, error: null }),
      then: (res) => res({ data: [], error: null }),
    };
    return q;
  };
  const persist = load('src/lib/events/persist-paid-event-registration.ts', {
    '@/lib/admin/form-log': { logFormSubmission: async () => {} },
    '@/lib/admin/ensure-contact': { ensureCrmContact: async () => 'contact-1' },
    '@/lib/families/lookup': { findFamilyIdByEmail: async () => null },
    '@/lib/events/sync': { ensureEventBySlug: async () => 'event-1' },
    '@/lib/events/skate-allowance': { consumeSkateAllowance: async () => {} },
    '@/lib/events/hebrew-fair-code-holds': { consumeHebrewFairCodeHolds: async () => {} },
    '@/lib/events/bbq-staff-codes': { consumeBbqStaffCode: async (x) => { consumes.push(x); return true; } },
    '@/lib/email/paid-event-confirmation': { sendPaidEventConfirmationEmail: async (x) => { emails.push(x); return true; } },
    '@/lib/events/paid-event-pricing': pricing,
    '@/lib/events/paid-events': events,
    '@/lib/events/paid-event-sheet': { appendPaidEventToSheet: async (x) => { sheetRows.push(x); } },
    '@/lib/donations/receipt-url': { buildReceiptUrl: (x) => { receipts.push(x); return 'https://receipt.test/r'; } },
    '@/lib/supabase/server': { createAdminClient: () => ({ from: fakeQuery }) },
    '@/lib/supabase/insert-helpers': { insertWithSchemaFallback: async (row, fn) => fn(row) },
    '@/lib/donations/normalize-donor': { normalizeDonorEmail: (x) => x.toLowerCase() },
  });
  await test('persist: CRM row + sheet + confirmation email + consume for paid gift-card checkout', async () => {
    const r = await persist.persistPaidEventRegistration({
      slug: 'teens-topgolf', firstName: 'Test', lastName: 'Person', email: 'T@Example.invalid', phone: '555',
      coverFee: false, sponsorAmount: 0, paymentIntentId: 'pi_topgolf_1',
      bbq: { attendees: 2, staffFree: true, staffCode: 'TG-TESTABCD' },
    });
    assert.equal(r.success, true);
    assert.equal(r.registrationId, 'reg-test-1');
    assert.equal(r.receiptUrl, 'https://receipt.test/r');
    const reg = inserted['event_registrations'][0];
    assert.equal(reg.event_slug, 'teens-topgolf');
    assert.equal(reg.amount, 20); // 2 attendees, one free with gift card
    assert.equal(reg.guest_count, 2);
    assert.equal(reg.stripe_payment_intent_id, 'pi_topgolf_1');
    assert.equal(reg.registration_details.type, 'bbq');
    assert.equal(sheetRows.length, 1);
    assert.equal(sheetRows[0].event.slug, 'teens-topgolf');
    assert.equal(sheetRows[0].bbq.attendees, 2);
    assert.equal(emails.length, 1);
    assert.equal(emails[0].event.title, 'HaBayit Teens Topgolf — Chanukah Kickoff');
    assert.equal(emails[0].pricing.total, 20);
    assert.equal(receipts[0].campaign, 'teens-topgolf');
    assert.equal(JSON.stringify(consumes), JSON.stringify([{ paymentIntentId: 'pi_topgolf_1', registrationId: 'reg-test-1' }]));
  });

  // ---------- E. Webhook rebuild ----------
  await test('webhook metadata rebuild maps teens-topgolf gift-card checkout', async () => {
    const rebuilt = persist.paidEventInputFromPaymentIntentMetadata({
      event_slug: 'teens-topgolf', type: 'paid_event_registration',
      donor_email: 't@example.invalid', first_name: 'Test', donor_name: 'Test Person',
      attendees: '2', bbq_staff_code: '1', sponsor_amount: '0', cover_fee: '0',
    }, 'pi_topgolf_1');
    assert.equal(rebuilt.slug, 'teens-topgolf');
    assert.equal(JSON.stringify(rebuilt.bbq), JSON.stringify({ attendees: 2, staffFree: true }));
  });

  // ---------- F. Migration 0033 on a real local Postgres ----------
  let PGlite;
  try { PGlite = require('@electric-sql/pglite').PGlite; } catch { PGlite = null; }
  if (!PGlite) {
    console.log('SKIP migration SQL tests (@electric-sql/pglite not installed)');
  } else {
    const db = new PGlite();
    await db.exec('create role anon; create role authenticated; create table event_registrations (id uuid primary key);');
    await db.exec(fs.readFileSync('supabase/migrations/0031_bbq_staff_codes.sql', 'utf8'));
    await db.exec(fs.readFileSync('supabase/migrations/0033_event_scoped_gift_code_claims.sql', 'utf8'));
    const q = async (sql) => (await db.query(sql)).rows;
    const one = async (sql) => (await q(sql))[0];

    await db.query("insert into bbq_staff_codes (code, event_slug) values ('BBQ-TESTCODE', 'teens-bbq')");
    // Go-live copy step (same strings, new event rows):
    await db.query("insert into bbq_staff_codes (code, event_slug) select code, 'teens-topgolf' from bbq_staff_codes where event_slug = 'teens-bbq'");

    await test('migration: same code string lives once per event', async () => {
      assert.equal((await one("select count(*)::int c from bbq_staff_codes where code='BBQ-TESTCODE'")).c, 2);
    });
    await test('legacy claim holds only the BBQ row', async () => {
      assert.equal((await one("select claim_bbq_staff_code('BBQ-TESTCODE','tok1')")).claim_bbq_staff_code, true);
      assert.equal((await one("select status from bbq_staff_codes where code='BBQ-TESTCODE' and event_slug='teens-topgolf'")).status, 'available');
    });
    await test('scoped claim reuses the same string independently for Topgolf', async () => {
      assert.equal((await one("select claim_event_gift_code('BBQ-TESTCODE','tok2','teens-topgolf')")).claim_event_gift_code, true);
      assert.equal((await one("select status from bbq_staff_codes where code='BBQ-TESTCODE' and event_slug='teens-topgolf'")).status, 'held');
      assert.equal((await one("select claim_token from bbq_staff_codes where code='BBQ-TESTCODE' and event_slug='teens-bbq'")).claim_token, 'tok1');
    });
    await test('contention: second token cannot take a held code; owner token is idempotent', async () => {
      assert.equal((await one("select claim_event_gift_code('BBQ-TESTCODE','tok3','teens-topgolf')")).claim_event_gift_code, false);
      assert.equal((await one("select claim_event_gift_code('BBQ-TESTCODE','tok2','teens-topgolf')")).claim_event_gift_code, true);
    });
    await test('wrong-event claim rejected', async () => {
      assert.equal((await one("select claim_event_gift_code('BBQ-TESTCODE','tok9','fire-on-ice')")).claim_event_gift_code, false);
    });
    await test('release then re-claim works', async () => {
      await db.query("select release_bbq_staff_code('tok2')");
      assert.equal((await one("select claim_event_gift_code('BBQ-TESTCODE','tok4','teens-topgolf')")).claim_event_gift_code, true);
    });
    await test('consume binds registration idempotently', async () => {
      await db.query("insert into event_registrations (id) values ('11111111-1111-1111-1111-111111111111')");
      assert.equal((await one("select consume_bbq_staff_code('tok4','11111111-1111-1111-1111-111111111111')")).consume_bbq_staff_code, true);
      assert.equal((await one("select consume_bbq_staff_code('tok4','11111111-1111-1111-1111-111111111111')")).consume_bbq_staff_code, true);
      assert.equal((await one("select status from bbq_staff_codes where code='BBQ-TESTCODE' and event_slug='teens-topgolf'")).status, 'consumed');
    });
    await test('rollback steps restore the original single-key table', async () => {
      await db.exec('drop function if exists claim_event_gift_code(text, text, text);');
      await db.exec("delete from bbq_staff_codes where event_slug = 'teens-topgolf';");
      await db.exec('alter table bbq_staff_codes drop constraint bbq_staff_codes_pkey;');
      await db.exec('alter table bbq_staff_codes add primary key (code);');
      assert.equal((await one("select count(*)::int c from bbq_staff_codes")).c, 1);
      let dup = false;
      try { await db.query("insert into bbq_staff_codes (code, event_slug) values ('BBQ-TESTCODE','teens-bbq')"); } catch { dup = true; }
      assert.equal(dup, true);
    });
  }

  console.log(count + ' tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
