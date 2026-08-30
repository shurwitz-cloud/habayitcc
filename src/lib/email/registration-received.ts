import { buildEmailHtml, emailButton, getSiteUrl, sendAdminNotification, sendEmail } from '@/lib/email/client';
import { HEBREW_ADVENTURE_NAME, HEBREW_ADVENTURE_PATH } from '@/lib/programs/names';
import type {
  HebrewAdventurePaymentMethod,
  HebrewAdventurePaymentPlan,
} from '@/lib/programs/hebrew-adventure-tuition';

function hebrewAdventurePaymentPlanLabel(plan: HebrewAdventurePaymentPlan): string {
  switch (plan) {
    case 'full':
      return 'Pay in full upon acceptance ($25 off)';
    case 'two_installments':
      return 'Two payments (acceptance + by October 1)';
    case 'three_installments':
      return 'Three payments (acceptance, October 1, November 1)';
  }
}

function hebrewAdventurePaymentMethodLabel(method: HebrewAdventurePaymentMethod): string {
  return method === 'card' ? 'Credit card (+3% fee)' : 'Bank account (ACH, no fee)';
}

export async function sendRegistrationReceivedEmail(input: {
  to: string;
  parentFirstName: string;
  childNames: string[];
  /** Prefer explicit labels; Adventure callers may still pass plan/method enums. */
  paymentPlanLabel?: string;
  paymentMethodLabel?: string;
  paymentPlan?: HebrewAdventurePaymentPlan;
  paymentMethod?: HebrewAdventurePaymentMethod;
  programName?: string;
  programPath?: string;
}): Promise<boolean> {
  const programName = input.programName ?? HEBREW_ADVENTURE_NAME;
  const programPath = input.programPath ?? HEBREW_ADVENTURE_PATH;
  const planLabel =
    input.paymentPlanLabel ??
    (input.paymentPlan ? hebrewAdventurePaymentPlanLabel(input.paymentPlan) : '—');
  const methodLabel =
    input.paymentMethodLabel ??
    (input.paymentMethod ? hebrewAdventurePaymentMethodLabel(input.paymentMethod) : '—');

  const childList =
    input.childNames.length === 1
      ? input.childNames[0]
      : input.childNames.slice(0, -1).join(', ') + ' and ' + input.childNames.at(-1);

  const html = buildEmailHtml(`
    <p style="font-size:20px;color:#172643;font-weight:bold;margin:0 0 16px;">
      We received your registration
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">
      Dear ${input.parentFirstName},
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">
      Thank you for registering <strong>${childList}</strong> for ${programName}.
      We are grateful that you are considering HaBayit for your family&apos;s Jewish journey.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">
      Your registration is now <strong>pending review</strong>. We will be in touch once it has
      been accepted. Your payment method is on file — <strong>you will not be charged until
      acceptance</strong>.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.6;margin:0 0 16px;">
      <tr><td style="padding:6px 0;color:#6f6a60;width:140px;">Payment plan</td><td style="padding:6px 0;">${planLabel}</td></tr>
      <tr><td style="padding:6px 0;color:#6f6a60;">Payment method</td><td style="padding:6px 0;">${methodLabel}</td></tr>
    </table>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">
      If you have any questions in the meantime, please reach out — we are happy to help.
    </p>
    <p style="margin:0;font-size:15px;line-height:1.7;">
      With appreciation,<br>
      <strong>The HaBayit Team</strong>
    </p>
    ${emailButton(`${getSiteUrl()}${programPath}`, 'Program details')}
  `);

  const [parentSent] = await Promise.all([
    sendEmail({
      to: input.to,
      subject: `${programName} registration received`,
      html,
    }),
    sendAdminNotification({
      subject: `New ${programName} registration — ${childList}`,
      replyTo: input.to,
      html: buildEmailHtml(`
        <p style="margin:0 0 12px;font-size:15px;"><strong>New registration (pending)</strong></p>
        <p style="margin:0;font-size:14px;line-height:1.7;">
          Parent: ${input.parentFirstName}<br>
          Email: ${input.to}<br>
          Children: ${childList}<br>
          Plan: ${planLabel}<br>
          Method: ${methodLabel}
        </p>
        ${emailButton(`${getSiteUrl()}/admin/registrations`, 'Review in admin')}
      `),
    }),
  ]);

  return parentSent;
}
