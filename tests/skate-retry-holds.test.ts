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
import { haHoldDisposition, reconcileHebrewFairHoldRow } from '../src/lib/events/hebrew-fair-code-holds';
import { reconcileSkateHoldRow } from '../src/lib/events/skate-allowance';

const EVENT = '11111111-1111-1111-1111-111111111111';
const PARTNER = '22222222-2222-2222-2222-222222222222';
const HA_REG = '33333333-3333-3333-3333-333333333333';

let shared: PGlite | null = null;
// One PGlite instance per process: six separate instances OOM this
// environment (SIGKILL). Hold tables are wiped per test instead.
async function db() {
  if (shared) {
    await shared.exec('delete from chai_event_skate_reservations; delete from hebrew_fair_code_holds;');
    return shared;
  }
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
  shared = pg;
  return pg;
}

// ---------- 1. Disposition matrix (pure) ----------

test('own unfinished checkout (requires_payment_method) -> cancel + release', () => {
  assert.equal(skateHoldDisposition('requires_payment_method', { expired: false, owned: true }), 'cancel_release');
  assert.equal(haHoldDisposition('requires_payment_method', { expired: false, owned: true }), 'cancel_release');
});

test('FOREIGN live checkout (requires_payment_method, no ownership proof) -> pending, NEVER canceled', () => {
  // requires_payment_method is also the state of a checkout whose
  // payer is actively entering card details in another browser. A
  // request that cannot prove it owns that checkout (no claim-token
  // cookie) must leave it alone and report in-progress.
  assert.equal(skateHoldDisposition('requires_payment_method', { expired: false, owned: false }), 'pending');
  assert.equal(haHoldDisposition('requires_payment_method', { expired: false, owned: false }), 'pending');
});

test('terminal states reconcile regardless of ownership (no cancellation involved)', () => {
  for (const owned of [false, true]) {
    assert.equal(skateHoldDisposition('succeeded', { expired: false, owned }), 'consume');
    assert.equal(skateHoldDisposition('canceled', { expired: false, owned }), 'release');
    assert.equal(haHoldDisposition('succeeded', { expired: false, owned }), 'consume');
    assert.equal(haHoldDisposition('canceled', { expired: false, owned }), 'release');
  }
});

test('own in-flight payment is pending, never canceled under the payer', () => {
  for (const status of ['requires_confirmation', 'requires_action', 'processing', 'requires_capture']) {
    for (const owned of [false, true]) {
      assert.equal(skateHoldDisposition(status, { expired: false, owned }), 'pending', status);
      assert.equal(haHoldDisposition(status, { expired: false, owned }), 'pending', status);
    }
  }
});

test('expired still-payable intents are canceled to a terminal state (unchanged)', () => {
  for (const status of ['requires_payment_method', 'requires_confirmation', 'requires_action']) {
    // the expired reconciler treats age as proof of abandonment
    assert.equal(skateHoldDisposition(status, { expired: true, owned: true }), 'cancel_release', status);
    assert.equal(haHoldDisposition(status, { expired: true, owned: true }), 'cancel_release', status);
  }
  assert.equal(skateHoldDisposition('processing', { expired: true, owned: true }), 'pending');
});

test('paid -> consume, canceled -> release, never bound -> release', () => {
  for (const expired of [false, true]) {
    assert.equal(skateHoldDisposition('succeeded', { expired, owned: true }), 'consume');
    assert.equal(skateHoldDisposition('canceled', { expired, owned: true }), 'release');
    assert.equal(skateHoldDisposition(null, { expired, owned: true }), 'release');
    assert.equal(haHoldDisposition('succeeded', { expired, owned: true }), 'consume');
    assert.equal(haHoldDisposition('canceled', { expired, owned: true }), 'release');
    assert.equal(haHoldDisposition(null, { expired, owned: true }), 'release');
  }
});


// ---------- 1b. Stripe-stubbed reconcile-row harness (injected deps) ----------

test('owned retry, no resume amount supplied: cancel then release, in that order', async () => {
  const order: string[] = [];
  const { outcome } = await reconcileSkateHoldRow('pi_x', { expired: false, owned: true }, {
    retrieve: async () => ({ status: 'requires_payment_method' }),
    cancel: async () => { order.push('cancel'); },
    consume: async () => { order.push('consume'); },
    releaseByPi: async () => { order.push('release'); },
  });
  assert.equal(outcome, 'released');
  assert.deepEqual(order, ['cancel', 'release']);
});

test('retrieve-cancel race: PI moved to processing, cancel throws -> failure, hold NOT released', async () => {
  const order: string[] = [];
  const { outcome } = await reconcileSkateHoldRow('pi_x', { expired: false, owned: true }, {
    retrieve: async () => ({ status: 'requires_payment_method' }),
    cancel: async () => { order.push('cancel'); throw new Error('You cannot cancel a PaymentIntent that is processing.'); },
    consume: async () => { order.push('consume'); },
    releaseByPi: async () => { order.push('release'); },
  });
  assert.equal(outcome, 'failure');
  assert.deepEqual(order, ['cancel']); // release never attempted
});

test('processing at retrieve: pending, cancel never called (double-charge protection)', async () => {
  for (const status of ['processing', 'requires_capture', 'requires_confirmation', 'requires_action']) {
    let canceled = false;
    const { outcome } = await reconcileSkateHoldRow('pi_x', { expired: false, owned: true }, {
      retrieve: async () => ({ status }),
      cancel: async () => { canceled = true; },
      consume: async () => undefined,
      releaseByPi: async () => undefined,
    });
    assert.equal(outcome, 'pending', status);
    assert.equal(canceled, false, status);
  }
});

test('foreign live checkout: pending, cancel never called even though never charged', async () => {
  let canceled = false;
  const { outcome } = await reconcileSkateHoldRow('pi_x', { expired: false, owned: false }, {
    retrieve: async () => ({ status: 'requires_payment_method' }),
    cancel: async () => { canceled = true; },
    consume: async () => undefined,
    releaseByPi: async () => undefined,
  });
  assert.equal(outcome, 'pending');
  assert.equal(canceled, false);
});

test('retrieve failure (unknown Stripe state) fails closed: no cancel, no release', async () => {
  const order: string[] = [];
  const { outcome } = await reconcileSkateHoldRow('pi_x', { expired: false, owned: true }, {
    retrieve: async () => { throw new Error('stripe unreachable'); },
    cancel: async () => { order.push('cancel'); },
    consume: async () => { order.push('consume'); },
    releaseByPi: async () => { order.push('release'); },
  });
  assert.equal(outcome, 'failure');
  assert.deepEqual(order, []);
});

test('paid-before-persist: succeeded -> consumed (+ orphan log)', async () => {
  const order: string[] = [];
  const { outcome } = await reconcileSkateHoldRow('pi_x', { expired: false, owned: true }, {
    retrieve: async () => ({ status: 'succeeded' }),
    cancel: async () => { order.push('cancel'); },
    consume: async () => { order.push('consume'); },
    releaseByPi: async () => { order.push('release'); },
    onOrphanPaid: () => { order.push('orphan-log'); },
  });
  assert.equal(outcome, 'consumed');
  assert.deepEqual(order, ['consume', 'orphan-log']);
});

test('HA row harness: race + foreign behave identically', async () => {
  let canceled = false;
  const { outcome: race } = await reconcileHebrewFairHoldRow('pi_x', { expired: false, owned: true }, {
    retrieve: async () => ({ status: 'requires_payment_method' }),
    cancel: async () => { canceled = true; throw new Error('processing'); },
    consume: async () => undefined,
    releaseByPi: async () => undefined,
  });
  assert.equal(race, 'failure');
  const { outcome: foreign } = await reconcileHebrewFairHoldRow('pi_x', { expired: false, owned: false }, {
    retrieve: async () => ({ status: 'requires_payment_method' }),
    cancel: async () => { canceled = true; },
    consume: async () => undefined,
    releaseByPi: async () => undefined,
  });
  assert.equal(foreign, 'pending');
  assert.equal(canceled, true); // only the race attempt called cancel; foreign never did
});

test('RESUME: owned unexpired amount-matching still-payable PI is returned, never canceled', async () => {
  for (const status of ['requires_payment_method', 'requires_confirmation', 'requires_action']) {
    const calls: string[] = [];
    const res = await reconcileSkateHoldRow('pi_x', { expired: false, owned: true, resumeAmountCents: 1700 }, {
      retrieve: async () => ({ status, amount: 1700, client_secret: 'sec_123' }),
      cancel: async () => { calls.push('cancel'); },
      consume: async () => { calls.push('consume'); },
      releaseByPi: async () => { calls.push('release'); },
    });
    assert.deepEqual(res, { outcome: 'resume', paymentIntentId: 'pi_x', clientSecret: 'sec_123' }, status);
    assert.deepEqual(calls, [], status);
  }
});

test('amount mismatch on owned retry: requires_payment_method cancels, requires_action stays pending', async () => {
  const rpm = await reconcileSkateHoldRow('pi_x', { expired: false, owned: true, resumeAmountCents: 1700 }, {
    retrieve: async () => ({ status: 'requires_payment_method', amount: 2100, client_secret: 'sec' }),
    cancel: async () => undefined,
    consume: async () => undefined,
    releaseByPi: async () => undefined,
  });
  assert.equal(rpm.outcome, 'released');
  let canceled = false;
  const ra = await reconcileSkateHoldRow('pi_x', { expired: false, owned: true, resumeAmountCents: 1700 }, {
    retrieve: async () => ({ status: 'requires_action', amount: 2100, client_secret: 'sec' }),
    cancel: async () => { canceled = true; },
    consume: async () => undefined,
    releaseByPi: async () => undefined,
  });
  assert.equal(ra.outcome, 'pending');
  assert.equal(canceled, false);
});

test('foreign checkout NEVER resumes even with a matching amount', async () => {
  const res = await reconcileSkateHoldRow('pi_x', { expired: false, owned: false, resumeAmountCents: 1700 }, {
    retrieve: async () => ({ status: 'requires_payment_method', amount: 1700, client_secret: 'sec' }),
    cancel: async () => undefined,
    consume: async () => undefined,
    releaseByPi: async () => undefined,
  });
  assert.equal(res.outcome, 'pending');
});

test('expired owned rows do not resume (cancel path preserved)', async () => {
  const res = await reconcileSkateHoldRow('pi_x', { expired: true, owned: true, resumeAmountCents: 1700 }, {
    retrieve: async () => ({ status: 'requires_payment_method', amount: 1700, client_secret: 'sec' }),
    cancel: async () => undefined,
    consume: async () => undefined,
    releaseByPi: async () => undefined,
  });
  assert.equal(res.outcome, 'released');
});

test('unknown/future Stripe status: pending, NEVER canceled (even expired)', async () => {
  for (const expired of [false, true]) {
    let canceled = false;
    const res = await reconcileSkateHoldRow('pi_x', { expired, owned: true }, {
      retrieve: async () => ({ status: 'some_future_status' }),
      cancel: async () => { canceled = true; },
      consume: async () => undefined,
      releaseByPi: async () => undefined,
    });
    assert.equal(res.outcome, 'pending');
    assert.equal(canceled, false);
  }
});

test('HA resume mirrors skate: match resumes, foreign never resumes', async () => {
  const ok = await reconcileHebrewFairHoldRow('pi_x', { expired: false, owned: true, resumeAmountCents: 1700 }, {
    retrieve: async () => ({ status: 'requires_confirmation', amount: 1700, client_secret: 'sec_ha' }),
    cancel: async () => undefined,
    consume: async () => undefined,
    releaseByPi: async () => undefined,
  });
  assert.deepEqual(ok, { outcome: 'resume', paymentIntentId: 'pi_x', clientSecret: 'sec_ha' });
  const foreign = await reconcileHebrewFairHoldRow('pi_x', { expired: false, owned: false, resumeAmountCents: 1700 }, {
    retrieve: async () => ({ status: 'requires_confirmation', amount: 1700, client_secret: 'sec_ha' }),
    cancel: async () => undefined,
    consume: async () => undefined,
    releaseByPi: async () => undefined,
  });
  assert.equal(foreign.outcome, 'pending');
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

test('competing browser: foreign token cannot release the live checkout holds', async () => {
  const pg = await db();
  // Browser A claims the whole entitlement (live checkout).
  await pg.query('select claim_skate_allowance($1,$2,$3,$4,$5,$6)', [EVENT, PARTNER, 'HABAYIT-TEST', 6, 'token-A', 6]);
  // Browser B's reconcile: rows are not in its ownership list, so the
  // disposition is pending and no release call is made. Prove the DB
  // level too: releasing by B's token frees nothing.
  await pg.query('select release_skate_allowance(p_claim_token := $1)', ['token-B']);
  const rows = await pg.query<{ status: string; claim_token: string }>(
    "select status, claim_token from chai_event_skate_reservations where event_id = $1 and partner_id = $2",
    [EVENT, PARTNER],
  );
  assert.equal(rows.rows.length, 6);
  for (const r of rows.rows) {
    assert.equal(r.status, 'reserved');
    assert.equal(r.claim_token, 'token-A');
  }
  // And B's own claim attempt is refused (shortfall -> in-progress reply).
  const b = await pg.query<{ claim_skate_allowance: number }>(
    'select claim_skate_allowance($1,$2,$3,$4,$5,$6)',
    [EVENT, PARTNER, 'HABAYIT-TEST', 6, 'token-B', 6],
  );
  assert.equal(b.rows[0].claim_skate_allowance, 0);
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
