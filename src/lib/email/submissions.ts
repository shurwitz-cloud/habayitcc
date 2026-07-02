/**
 * Central registry of auto-emails for every public form submission.
 *
 * When adding a new form:
 * 1. Add a template in src/lib/email/
 * 2. Register it in SUBMISSION_EMAILS below
 * 3. Call the send function from the form's server action (after save succeeds)
 *
 * Requires RESEND_API_KEY + RESEND_FROM_EMAIL on Vercel (see .env.example).
 */

export { sendContactEmails } from './contact';
export { sendRsvpConfirmationEmail } from './rsvp-confirmation';
export { sendDonationTaxReceiptEmail, sendDonationReceiptEmailFromRecord } from './donation-receipt';
export { sendChaiPartnerWelcomeEmail } from './chai-partner-welcome';
export { sendRegistrationReceivedEmail } from './registration-received';
export { sendRegistrationAcceptedEmail } from './registration-accepted';

/** Every user-facing submission and its confirmation email. */
export const SUBMISSION_EMAILS = {
  contact: {
    description: 'Contact form — user thank-you + admin notification',
    handler: 'sendContactEmails',
    trigger: 'src/app/contact/actions.ts → submitContactForm',
  },
  rsvp: {
    description: 'Event RSVP — attendee confirmation + admin notification',
    handler: 'sendRsvpConfirmationEmail',
    trigger: 'src/app/rsvp/[slug]/actions.ts → submitRsvp',
  },
  donation_one_time: {
    description: 'One-time donation — tax receipt email',
    handler: 'sendDonationReceiptEmailFromRecord',
    trigger: 'src/app/donate/actions.ts → recordDonation; webhook backup',
  },
  donation_monthly_start: {
    description: 'Monthly donation signup — thank-you + tax receipt',
    handler: 'sendDonationReceiptEmailFromRecord (donationType: Monthly)',
    trigger: 'src/app/donate/actions.ts → recordDonation',
  },
  donation_monthly_renewal: {
    description: 'Recurring monthly donation charge — tax receipt',
    handler: 'sendDonationReceiptEmailFromRecord',
    trigger: 'src/app/api/webhooks/stripe/route.ts → invoice.payment_succeeded',
  },
  chai_partner: {
    description: 'Chai Partner signup — welcome + access code + admin notification',
    handler: 'sendChaiPartnerWelcomeEmail',
    trigger: 'src/app/chai-partner/actions.ts → confirmChaiPartnerPayment',
  },
  hebrew_adventure_registration: {
    description: 'Hebrew Adventure registration submitted — pending review confirmation',
    handler: 'sendRegistrationReceivedEmail',
    trigger: 'src/app/hebrew-adventure/register/actions.ts → submitHebrewSchoolRegistration',
  },
  hebrew_adventure_accepted: {
    description: 'Hebrew Adventure accepted — charge confirmation + schedule',
    handler: 'sendRegistrationAcceptedEmail',
    trigger: 'src/app/admin/registrations/actions.ts → acceptRegistration',
  },
} as const;

export type SubmissionEmailType = keyof typeof SUBMISSION_EMAILS;
