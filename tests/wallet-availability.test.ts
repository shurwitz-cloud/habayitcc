/**
 * Watchdog tests for the silent Apple Pay session-start abort
 * (stripe/stripe-js#909): on WebKit/Safari the tap produces no sheet, no
 * error and no cancel - only an unhandled rejection with a recognizable
 * message. The matcher must catch Stripe's converted error and Safari's
 * raw message, reject look-alikes, and only fire right after a wallet tap.
 *
 * Run: npx tsx --test tests/wallet-availability.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isApplePaySessionAbort,
  isWithinAbortWatchWindow,
  WALLET_ABORT_WATCH_WINDOW_MS,
  WALLET_ABORT_FALLBACK_MESSAGE,
} from '../src/lib/events/wallet-availability';

test('matches Safari raw rejection and Stripe converted error (live bundle wording)', () => {
  assert.equal(
    isApplePaySessionAbort(new Error('Trying to start an Apple Pay session from an insecure document.')),
    true,
  );
  assert.equal(
    isApplePaySessionAbort(
      new Error('Trying to start an Apple Pay session from a document with an insecure parent frame.'),
    ),
    true,
  );
  // Wording thrown by the currently served js.stripe.com/v3 bundle (verified 2026-11-15).
  assert.equal(
    isApplePaySessionAbort(
      new Error(
        'Apple Pay requires your page to be served over HTTPS in a secure context. To use Apple Pay, ensure that your page and all parent frames use HTTPS.',
      ),
    ),
    true,
  );
  // String rejections, not just Error objects.
  assert.equal(
    isApplePaySessionAbort('Trying to start an Apple Pay session from an insecure document.'),
    true,
  );
});

test('rejects unrelated and look-alike rejections', () => {
  assert.equal(isApplePaySessionAbort(new Error('Payment failed. Please try again.')), false);
  assert.equal(isApplePaySessionAbort(new Error('Must create a new ApplePaySession from a user gesture handler.')), false);
  assert.equal(isApplePaySessionAbort(new Error('NetworkError when attempting to fetch resource.')), false);
  assert.equal(isApplePaySessionAbort(undefined), false);
  assert.equal(isApplePaySessionAbort(null), false);
  assert.equal(isApplePaySessionAbort({ message: 'no' }), false);
});

test('watch window: only right after a wallet tap', () => {
  assert.equal(isWithinAbortWatchWindow(null, 1000), false);
  assert.equal(isWithinAbortWatchWindow(1000, 1000), true);
  assert.equal(isWithinAbortWatchWindow(1000, 1000 + WALLET_ABORT_WATCH_WINDOW_MS), true);
  assert.equal(isWithinAbortWatchWindow(1000, 1000 + WALLET_ABORT_WATCH_WINDOW_MS + 1), false);
});

test('fallback message points to the card form and admits Apple Pay did not start', () => {
  assert.match(WALLET_ABORT_FALLBACK_MESSAGE, /could not start/i);
  assert.match(WALLET_ABORT_FALLBACK_MESSAGE, /card form below/i);
});
