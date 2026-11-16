/**
 * Wallet error presentation regression tests: a rejected wallet tap must
 * surface a visible, correctly-worded error next to the wallet buttons and
 * move focus to the first missing contact field. The old path set only the
 * form-level error below Card Details, invisible on a phone, so a rejected
 * tap looked like "nothing happens".
 *
 * Run: npx tsx --test tests/wallet-error.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IDENTITY_VALIDATION_MESSAGE,
  WALLET_CONTACT_MESSAGE,
  IDENTITY_FIELD_IDS,
  walletErrorDisplay,
  firstMissingIdentityField,
  walletErrorFocusTarget,
} from '../src/lib/events/wallet-error';

const FULL = { firstName: 'A', lastName: 'B', email: 'a@b.com', phone: '5551234567' };

test('identity validation message is reworded to name contact details, not card fields', () => {
  const shown = walletErrorDisplay(IDENTITY_VALIDATION_MESSAGE);
  assert.equal(shown, WALLET_CONTACT_MESSAGE);
  assert.match(shown, /name, email, and phone/i);
  assert.doesNotMatch(shown, /card/i);
});

test('other wallet errors pass through unchanged', () => {
  assert.equal(walletErrorDisplay('Payment failed. Please try again.'), 'Payment failed. Please try again.');
  assert.equal(walletErrorDisplay('Nothing to pay.'), 'Nothing to pay.');
});

test('first missing contact field follows form order', () => {
  assert.equal(firstMissingIdentityField({ firstName: '', lastName: '', email: '', phone: '' }), 'firstName');
  assert.equal(firstMissingIdentityField({ ...FULL, lastName: ' ' }), 'lastName');
  assert.equal(firstMissingIdentityField({ ...FULL, email: '' }), 'email');
  assert.equal(firstMissingIdentityField({ ...FULL, phone: '' }), 'phone');
  assert.equal(firstMissingIdentityField(FULL), null);
});

test('focus target is the first missing contact field for identity errors', () => {
  assert.equal(
    walletErrorFocusTarget(IDENTITY_VALIDATION_MESSAGE, { ...FULL, email: '' }),
    IDENTITY_FIELD_IDS.email,
  );
  assert.equal(
    walletErrorFocusTarget(IDENTITY_VALIDATION_MESSAGE, { firstName: '', lastName: '', email: '', phone: '' }),
    IDENTITY_FIELD_IDS.firstName,
  );
});

test('no field focus for non-identity errors or when fields are filled', () => {
  assert.equal(walletErrorFocusTarget('Payment failed. Please try again.', { ...FULL, email: '' }), null);
  // Validator only returns the identity message when something is missing,
  // but if fields are filled there is nothing to focus.
  assert.equal(walletErrorFocusTarget(IDENTITY_VALIDATION_MESSAGE, FULL), null);
});

test('field ids are stable element ids used by the form', () => {
  assert.deepEqual(IDENTITY_FIELD_IDS, {
    firstName: 'reg-first-name',
    lastName: 'reg-last-name',
    email: 'reg-email',
    phone: 'reg-phone',
  });
});
