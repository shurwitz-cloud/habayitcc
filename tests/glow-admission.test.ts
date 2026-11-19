import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { getPaidEvent } from '../src/lib/events/paid-events';
import { computePaidEventTotal } from '../src/lib/events/paid-event-pricing';

const event = getPaidEvent('chanukah-glow-party')!;

test('Glow: fixed partner price, two admissions maximum, no other discounts', () => {
  const price = (n: number, member: boolean, claimed = 2) => computePaidEventTotal({
    event, skate: { skaters: n, memberDiscount: member, memberPeople: claimed, haDiscountedSkaters: 99 },
    sponsorAmount: 0, coverFee: false,
  }).total;
  assert.equal(event.ticketPrice, 15);
  assert.equal(event.memberTicketPrice, 10);
  assert.equal(event.memberPeopleLimit, 2);
  assert.equal(price(1, false), 15);
  assert.equal(price(1, true), 10);
  assert.equal(price(2, true), 20);
  assert.equal(price(3, true), 35);
  assert.equal(price(7, true), 95);
  assert.equal(price(7, true, 99), 95);
  assert.equal(price(2, false), 30);
});

test('Glow: atomic two-slot entitlement can retry unpaid, blocks second reservation after paid', async () => {
  const pg = new PGlite();
  await pg.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create table events (id uuid primary key);
    create table chai_partners (id uuid primary key);
    create table program_registrations (id uuid primary key);
    create table hebrew_fair_code_redemptions (
      id uuid primary key default gen_random_uuid(), program_registration_id uuid not null,
      event_id uuid not null, fair_access_code text, event_registration_id uuid,
      redeemed_at timestamptz default now(), unique (program_registration_id, event_id)
    );
    insert into events values ('11111111-1111-1111-1111-111111111111');
    insert into chai_partners values ('22222222-2222-2222-2222-222222222222');
  `);
  for (const file of ['0028_skate_allowance_reservations.sql','0029_skate_allowance_hold_counting.sql']) {
    await pg.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }
  const claim = async (token: string) => {
    const r = await pg.query<{n: number}>('select claim_skate_allowance($1,$2,$3,2,$4,2) as n', [
      '11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','MOCK-ONLY',token,
    ]); return r.rows[0].n;
  };
  assert.equal(await claim('first'), 2);
  assert.equal(await claim('competing'), 0);
  await pg.query('update chai_event_skate_reservations set payment_intent_id=$2 where claim_token=$1', ['first','pi_mock_failed']);
  await pg.query('select release_skate_allowance(p_payment_intent_id => $1)', ['pi_mock_failed']);
  assert.equal(await claim('retry'), 2);
  await pg.query('update chai_event_skate_reservations set payment_intent_id=$2 where claim_token=$1', ['retry','pi_mock_paid']);
  await pg.query('select consume_skate_allowance($1)', ['pi_mock_paid']);
  assert.equal(await claim('second-reservation'), 0);
  await pg.close();
});
