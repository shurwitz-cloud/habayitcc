/**
 * Wallet diagnostics safety tests. The critical guarantees:
 *  1. Diagnostic mode stops the confirm step BEFORE any PaymentIntent can
 *     be created (shouldStopConfirmForDebug gates createClientSecret and
 *     stripe.confirmPayment in WalletPayButtons.handleConfirm).
 *  2. Ordinary mode (no ?wallet_debug=1) is unchanged.
 *  3. The recorder only emits event enums, relative ms timestamps and
 *     boolean availability flags - no userAgent, contact, amount or card
 *     data can be expressed.
 *
 * Run: npx tsx --test tests/wallet-debug.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WALLET_DEBUG_EVENTS,
  diagnosticStopConfirm,
  CONFIRM_STOP_MESSAGE,
  isWalletDebugEnabled,
  shouldStopConfirmForDebug,
  createWalletDebugRecorder,
  type WalletDebugEvent,
} from '../src/lib/events/wallet-debug';

test('debug mode is enabled only by wallet_debug=1', () => {
  assert.equal(isWalletDebugEnabled('?wallet_debug=1'), true);
  assert.equal(isWalletDebugEnabled('?foo=bar&wallet_debug=1'), true);
  assert.equal(isWalletDebugEnabled(''), false);
  assert.equal(isWalletDebugEnabled('?wallet_debug=0'), false);
  assert.equal(isWalletDebugEnabled('?wallet_debug=true'), false);
  assert.equal(isWalletDebugEnabled('?wallet_debug=1x'), false);
});

test('diagnostic mode must stop confirm before intent creation; ordinary mode must not', () => {
  assert.equal(shouldStopConfirmForDebug(true), true);
  assert.equal(shouldStopConfirmForDebug(false), false);
});

test('stop message tells the user no payment was created', () => {
  assert.match(CONFIRM_STOP_MESSAGE, /stopped before any payment was created/i);
});

test('recorder emits only enums, relative ms and boolean flags', () => {
  let t = 1000;
  const rec = createWalletDebugRecorder(() => t);
  rec.record('ready', {
    applePayAvailable: true,
    googlePayAvailable: false,
    linkAvailable: true,
    applePaySessionApi: true,
    applePayCanMakePayments: undefined,
  });
  t = 1234;
  rec.record('click');
  t = 1300;
  rec.record('resolve');
  t = 1450;
  rec.record('cancel');
  const lines = rec.lines();
  assert.equal(lines.length, 4);
  assert.equal(lines[0], 'T+0ms ready applePayAvailable=1 googlePayAvailable=0 linkAvailable=1 applePaySessionApi=1 applePayCanMakePayments=?');
  assert.equal(lines[1], 'T+234ms click');
  assert.equal(lines[2], 'T+300ms resolve');
  assert.equal(lines[3], 'T+450ms cancel');
  for (const line of lines) {
    assert.match(line, /^T\+\d+ms [a-z-]+( [a-zA-Z]+=[01?])*$/);
    // No contact/amount/agent data can appear in a line.
    assert.doesNotMatch(line, /@|\$|Mozilla|iPhone|Safari|\d{3,}\.\d{2}/);
  }
});

test('recorder silently drops non-enum events', () => {
  const rec = createWalletDebugRecorder(() => 0);
  rec.record('userAgent=Mozilla' as unknown as WalletDebugEvent);
  rec.record('click');
  assert.deepEqual(rec.lines(), ['T+0ms click']);
});

test('event enum covers the full click pipeline', () => {
  for (const e of ['ready', 'click', 'resolve', 'reject', 'confirm-entered', 'confirm-stopped', 'cancel', 'error']) {
    assert.ok(WALLET_DEBUG_EVENTS.includes(e as WalletDebugEvent), e);
  }
});

test('diagnosticStopConfirm: exactly one paymentFailed, two records, nothing else reachable', () => {
  const calls: string[] = [];
  diagnosticStopConfirm(
    (message) => calls.push(`paymentFailed:${message}`),
    (event) => calls.push(`record:${event}`),
  );
  assert.deepEqual(calls, [
    'record:confirm-entered',
    `paymentFailed:${CONFIRM_STOP_MESSAGE}`,
    'record:confirm-stopped',
  ]);
});

test('component guard precedes and returns before every intent-creation call site', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(
    new URL('../src/components/stripe/WalletPayButtons.tsx', import.meta.url),
    'utf8',
  );
  const guard = src.indexOf('shouldStopConfirmForDebug(Boolean(debugRef.current))');
  assert.ok(guard > 0, 'guard present in handleConfirm');
  const guardBlock = src.slice(guard, guard + 400);
  assert.match(guardBlock, /diagnosticStopConfirm\(/);
  assert.match(guardBlock, /return;/);
  for (const site of ['createClientSecretRef.current()', 'elements.submit()', 'stripe.confirmPayment(']) {
    const at = src.indexOf(site);
    assert.ok(at > guard, `${site} exists after the guard`);
    // The guard block returns before any of these can run.
    assert.ok(src.slice(guard, at).includes('return;'), `guard returns before ${site}`);
  }
  // In ordinary (non-debug) mode the panel stays off and no cancel handler attaches.
  assert.match(src, /onCancel=\{debugEnabled \? handleCancel : undefined\}/);
});
