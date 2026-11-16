/**
 * Wallet (Apple Pay / Google Pay) error presentation for paid event
 * registration.
 *
 * The wallet buttons sit far above the form-level error block (which
 * renders below Card Details), so on a phone a rejected wallet tap looked
 * like "nothing happens". These helpers decide what the wallet-local
 * error says and where focus should go. Pure functions, no Stripe or DOM
 * dependency, so they are unit-testable.
 */

/** Message validateRegistrationFields() returns when contact details are missing. */
export const IDENTITY_VALIDATION_MESSAGE = 'Please fill in all required fields.';

/**
 * Wallet-local wording for the identity case: near the wallet buttons
 * "all required fields" reads as card details, so name the actual fields.
 */
export const WALLET_CONTACT_MESSAGE =
  'Please fill in your name, email, and phone above, then tap the wallet button again.';

export const IDENTITY_FIELD_IDS = {
  firstName: 'reg-first-name',
  lastName: 'reg-last-name',
  email: 'reg-email',
  phone: 'reg-phone',
} as const;

export interface IdentityFieldValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

/** Text to show next to the wallet buttons for a wallet error. */
export function walletErrorDisplay(message: string): string {
  return message === IDENTITY_VALIDATION_MESSAGE ? WALLET_CONTACT_MESSAGE : message;
}

/** First empty contact field, in form order, or null when all are filled. */
export function firstMissingIdentityField(
  values: IdentityFieldValues,
): keyof typeof IDENTITY_FIELD_IDS | null {
  if (!values.firstName.trim()) return 'firstName';
  if (!values.lastName.trim()) return 'lastName';
  if (!values.email.trim()) return 'email';
  if (!values.phone.trim()) return 'phone';
  return null;
}

/**
 * Element id to scroll to and focus for a wallet error: the first missing
 * contact field for identity errors, null otherwise (caller scrolls to the
 * wallet error block itself instead).
 */
export function walletErrorFocusTarget(
  message: string,
  values: IdentityFieldValues,
): string | null {
  if (message !== IDENTITY_VALIDATION_MESSAGE) return null;
  const missing = firstMissingIdentityField(values);
  return missing ? IDENTITY_FIELD_IDS[missing] : null;
}
