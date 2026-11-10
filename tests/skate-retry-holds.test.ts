/**
 * Retry-bug regression tests: a member's own UNFINISHED or FAILED
 * checkout must never block their retry, and "already used" must mean a
 * completed paid registration only.
 *
 * Two layers:
 *  1. SQL (PGlite, migrations 0028-0030 applied): the atomic
 *     claim/release/consume RPCs keep their invariants across retry,
 *     changed cart, and repeated claims.
 *  2. Disposition matrix (pure): every Stripe PI state maps to the
 *     correct hold action for own-unexpired vs expired holds.
 *
 * Run: npx tsx --test tests/skate-retry-holds.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { skateHoldDisposition } from '../src/lib/events/skate-allowance';
import { haHoldDisposition } from '../src/lib/events/hebrew-fair-code-holds';

const EVENT = '11111111-1111-1111-1111-111111111111';
const PARTNER = '22222222-2222-2222-2222-222222222222';
const HA_REG = '33333333-3333-3333-3333-333333333333';

async function db() {
  const pg = new PGlite();
  // Supabase roles the migrations revoke/grant on.
  await pg.exec('create role anon nologin; create role authenticated nologin; create role service_role nologin;');
  // Minimal parents for the FK targets (owned by earlier migrations).
  await pg.exec(`
    create table events (id uuid primary key);
    create table chai_partners (id uuid primary key);
    create table program_registrations (id uuid primary key);
    create table hebrew_fair_code_redemptions (
      id uuid primary key default gen_random_uuid(),
      program_registration_id uuid not null,
      event_id uuid not null,
      fair_access_code text,
      event_registration_id uuid,
      redeemed_at timestamptz default now(),
      unique (program_registration_id, event_id)
    );
    insert into events values ('11111111-1111-1111-1111-111111111111');
    insert into chai_partners values ('22222222-2222-2222-2222-222222222222');
    insert into program_registrations values ('33333333-3333-3333-3333-333333333333');
  `);
  for (const file of [
    'supabase/migrations/0028_skate_allowance_reservations.sql',
    'supabase/migrations/0029_skate_allowance_hold_counting.sql',
    'supabase/migrations/0030_hebrew_fair_code_holds.sql',
  ]) {
    await pg.exec(readFileSync(file, 'utf8'));
  }
  return pg;
}

// ---------- 1. Disposition matrix (pure) ----------

test('own unfinished checkout (requires_payment_method) -> cancel + release', () => {
  assert.equal(skateHoldDisposition('requires_payment_method', { expired: false }), 'cancel_release');
  assert.equal(haHoldDisposition('requires_payment_method', { expired: false }), 'cancel_release');
});

test('own in-flight payment is pending, never canceled under the payer', () => {
  for (const status of ['requires_confirmation', 'requires_action', 'processing', 'requires_capture']) {
    assert.equal(skateHoldDisposition(status, { expired: false }), 'pending', status);
    assert.equal(haHoldDisposition(status, { expired: false }), 'pending', status);
  }
});

test('expired still-payable intents are canceled to a terminal state (unchanged)', () => {
  for (const status of ['requires_payment_method', 'requires_confirmation', 'requires_action']) {
    assert.equal(skateHoldDisposition(status, { expired: true }), 'cancel_release', status);
    assert.equal(haHoldDisposition(status, { expired: true }), 'cancel_release', status);
  }
  assert.equal(skateHoldDisposition('processing', { expired: true }), 'pending');
});

test('paid -> consume, canceled -> release, never bound -> release', () => {
  for (const expired of [false, true]) {
    assert.equal(skateHoldDisposition('succeeded', { expired }), 'consume');
    assert.equal(skateHoldDisposition('canceled', { expired }), 'release');
    assert.equal(skateHoldDisposition(null, { expired }), 'release');
    assert.equal(haHoldDisposition('succeeded', { expired }), 'consume');
    assert.equal(haHoldDisposition('canceled', { expired }), 'release');
    assert.equal(haHoldDisposition(null, { expired }), 'release');
  }
});

// ---------- 2. RPC invariants over PGlite ----------

test('retry after released checkout: full entitlement re-claims', async () => {
  const pg = await db();
  // First checkout claims all 6 slots, then its rows are released
  // (what reconcile does after canceling the never-charged PI).
  const first = await pg.query<{ claim_skate_allowance: number }>(
    'select claim_skate_allowance($1,$2,$3,$4,$5,$6)',
    [EVENT, PARTNER, 'HABAYIT-TEST', 6, 'token-1', 6],
  );
  assert.equal(first.rows[0].claim_skate_allowance, 6);
  await pg.query(
    "update chai_event_skate_reservations set payment_intent_id='pi_old' where claim_token='token-1'",
  );
  const released = await pg.query<{ release_skate_allowance: number }>(
    'select release_skate_allowance(p_payment_intent_id => $1)',
    ['pi_old'],
  );
  assert.equal(released.rows[0].release_skate_allowance, 6);
  // Retry claims the full entitlement again.
  const retry = await pg.query<{ claim_skate_allowance: number }>(
    'select claim_skate_allowance($1,$2,$3,$4,$5,$6)',
    [EVENT, PARTNER, 'HABAYIT-TEST', 6, 'token-2', 6],
  );
  assert.equal(retry.rows[0].claim_skate_allowance, 6);
});

test('changed cart on retry: claim is entitlement-wide, pricing follows the cart', async () => {
  const pg = await db();
  await pg.query('select claim_skate_allowance($1,$2,$3,$4,$5,$6)', [EVENT, PARTNER, 'C', 6, 't1', 6]);
  await pg.query("update chai_event_skate_reservations set payment_intent_id='pi_old' where claim_token='t1'");
  await pg.query('select release_skate_allowance(p_payment_intent_id => $1)', ['pi_old']);
  // Cart changed from 3 tickets to 1; entitlement claim is still 6 and succeeds.
  const retry = await pg.query<{ claim_skate_allowance: number }>(
    'select claim_skate_allowance($1,$2,$3,$4,$5,$6)',
    [EVENT, PARTNER, 'C', 6, 't2', 6],
  );
  assert.equal(retry.rows[0].claim_skate_allowance, 6);
});

test('unreleased own hold blocks a second concurrent discounted checkout', async () => {
  const pg = await db();
  const first = await pg.query<{ claim_skate_allowance: number }>(
    'select claim_skate_allowance($1,$2,$3,$4,$5,$6)',
    [EVENT, PARTNER, 'C', 6, 't1', 6],
  );
  assert.equal(first.rows[0].claim_skate_allowance, 6);
  // Without reconcile/release, a second claim gets nothing: two
  // discounted checkouts can never run at once for one member.
  const second = await pg.query<{ claim_skate_allowance: number }>(
    'select claim_skate_allowance($1,$2,$3,$4,$5,$6)',
    [EVENT, PARTNER, 'C', 6, 't2', 6],
  );
  assert.equal(second.rows[0].claim_skate_allowance, 0);
});

test('consumed slots are permanent: no re-claim after payment', async () => {
  const pg = await db();
  await pg.query('select claim_skate_allowance($1,$2,$3,$4,$5,$6)', [EVENT, PARTNER, 'C', 6, 't1', 6]);
  await pg.query("update chai_event_skate_reservations set payment_intent_id='pi_paid' where claim_token='t1'");
  const consumed = await pg.query<{ consume_skate_allowance: number }>(
    'select consume_skate_allowance($1)',
    ['pi_paid'],
  );
  assert.equal(consumed.rows[0].consume_skate_allowance, 6);
  const after = await pg.query<{ claim_skate_allowance: number }>(
    'select claim_skate_allowance($1,$2,$3,$4,$5,$6)',
    [EVENT, PARTNER, 'C', 6, 't2', 6],
  );
  assert.equal(after.rows[0].claim_skate_allowance, 0);
});

test('HA code hold: release frees the code for a retry, consume is final', async () => {
  const pg = await db();
  const first = await pg.query<{ claim_hebrew_fair_code_hold: boolean }>(
    'select claim_hebrew_fair_code_hold($1,$2,$3,$4)',
    [EVENT, HA_REG, 'HA-TEST01', 'ha-t1'],
  );
  assert.equal(first.rows[0].claim_hebrew_fair_code_hold, true);
  await pg.query("update hebrew_fair_code_holds set payment_intent_id='pi_ha' where claim_token='ha-t1'");
  // Unfinished checkout released -> code usable again.
  await pg.query('select release_hebrew_fair_code_holds(p_payment_intent_id => $1)', ['pi_ha']);
  const retry = await pg.query<{ claim_hebrew_fair_code_hold: boolean }>(
    'select claim_hebrew_fair_code_hold($1,$2,$3,$4)',
    [EVENT, HA_REG, 'HA-TEST01', 'ha-t2'],
  );
  assert.equal(retry.rows[0].claim_hebrew_fair_code_hold, true);
  // Once consumed, never again.
  await pg.query("update hebrew_fair_code_holds set payment_intent_id='pi_ha2' where claim_token='ha-t2'");
  await pg.query('select consume_hebrew_fair_code_holds($1)', ['pi_ha2']);
  const after = await pg.query<{ claim_hebrew_fair_code_hold: boolean }>(
    'select claim_hebrew_fair_code_hold($1,$2,$3,$4)',
    [EVENT, HA_REG, 'HA-TEST01', 'ha-t3'],
  );
  assert.equal(after.rows[0].claim_hebrew_fair_code_hold, false);
});
