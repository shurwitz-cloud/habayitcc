/**
 * Client-only wallet diagnostics for the "tap does nothing" Apple Pay
 * failure. Gated behind ?wallet_debug=1 so only a deliberate diagnostic
 * session sees it. Everything stays on the device: no network calls, no
 * storage, nothing leaves the page except what the user copies out by
 * hand. Only event names, relative timestamps, and boolean availability
 * flags are recorded - never names, emails, phones, amounts, user agents,
 * or card data.
 *
 * Removal: delete this file, the marked debug blocks in
 * WalletPayButtons.tsx, and tests/wallet-debug.test.ts.
 */

export const WALLET_DEBUG_PARAM = 'wallet_debug';

export const WALLET_DEBUG_EVENTS = [
  'ready',
  'click',
  'resolve',
  'reject',
  'confirm-entered',
  'confirm-stopped',
  'cancel',
  'error',
] as const;
export type WalletDebugEvent = (typeof WALLET_DEBUG_EVENTS)[number];

/** Boolean-only availability signals; nothing identifying, nothing about the payment. */
export interface WalletDebugFlags {
  applePayAvailable?: boolean;
  googlePayAvailable?: boolean;
  linkAvailable?: boolean;
  applePaySessionApi?: boolean;
  applePayCanMakePayments?: boolean;
}

/** Shown in the sheet and panel when diagnostic mode stops the payment. */
export const CONFIRM_STOP_MESSAGE =
  'Diagnostic mode: stopped before any payment was created.';

export function isWalletDebugEnabled(search: string): boolean {
  return new URLSearchParams(search).get(WALLET_DEBUG_PARAM) === '1';
}

/**
 * In diagnostic mode the confirm step must stop before createClientSecret
 * or stripe.confirmPayment can run, so no PaymentIntent can be created.
 */
export function shouldStopConfirmForDebug(debugEnabled: boolean): boolean {
  return debugEnabled;
}

/**
 * Diagnostic confirm path. The only payment-facing call this may make is
 * paymentFailed - no PaymentIntent creation, no elements.submit, no
 * confirmPayment can be reached from here.
 */
export function diagnosticStopConfirm(
  paymentFailed: (message: string) => void,
  record: (event: WalletDebugEvent) => void,
): void {
  record('confirm-entered');
  paymentFailed(CONFIRM_STOP_MESSAGE);
  record('confirm-stopped');
}

export interface WalletDebugRecorder {
  record(event: WalletDebugEvent, flags?: WalletDebugFlags): void;
  lines(): string[];
}

export function createWalletDebugRecorder(
  now: () => number = () => performance.now(),
): WalletDebugRecorder {
  const start = now();
  const entries: string[] = [];
  return {
    record(event, flags) {
      if (!WALLET_DEBUG_EVENTS.includes(event)) return;
      const t = Math.round(now() - start);
      const flagText = flags
        ? ' ' +
          Object.entries(flags)
            .map(([k, v]) => `${k}=${v === undefined ? '?' : v ? 1 : 0}`)
            .join(' ')
        : '';
      entries.push(`T+${t}ms ${event}${flagText}`);
    },
    lines() {
      return [...entries];
    },
  };
}
