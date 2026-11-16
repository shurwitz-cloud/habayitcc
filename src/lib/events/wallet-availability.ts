/**
 * Detects the silent Apple Pay abort documented in stripe/stripe-js#909:
 * on WebKit/Safari, Stripe.js constructs ApplePaySession inside its own
 * iframe; when Safari refuses ("Trying to start an Apple Pay session from
 * an insecure document"), Stripe converts it into a thrown error that
 * surfaces only as an unhandled rejection. The wallet tap then looks dead:
 * no sheet, no error event, no cancel event. These helpers decide whether
 * an unhandled rejection matches that signature so the UI can show a
 * visible fallback message instead of nothing. Pure and unit-testable.
 */

/** Stripe's converted error and Safari's raw rejection both mention Apple Pay session start. */
const APPLE_PAY_ABORT_PATTERNS = [
  'Trying to start an Apple Pay session from an insecure document',
  'Trying to start an Apple Pay session from a document with an insecure parent frame',
  'Apple Pay requires your page to be served over HTTPS',
];

/** Message shown next to the wallet buttons when this abort is detected. */
export const WALLET_ABORT_FALLBACK_MESSAGE =
  'Apple Pay could not start in this browser. Please use the secure card form below.';

function reasonText(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === 'string') return reason;
  return '';
}

/** True when an unhandled rejection is the silent Apple Pay session-start abort. */
export function isApplePaySessionAbort(reason: unknown): boolean {
  const text = reasonText(reason);
  return APPLE_PAY_ABORT_PATTERNS.some((p) => text.includes(p));
}

/**
 * The abort only counts right after a wallet tap; a stray matching
 * rejection from page-load capability detection must not surface a
 * payment message. Window is deliberately short.
 */
export const WALLET_ABORT_WATCH_WINDOW_MS = 4000;

export function isWithinAbortWatchWindow(
  lastWalletClickAt: number | null,
  now: number,
): boolean {
  return lastWalletClickAt !== null && now - lastWalletClickAt <= WALLET_ABORT_WATCH_WINDOW_MS;
}
