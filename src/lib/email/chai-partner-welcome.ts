import { buildEmailHtml, emailButton, getAdminEmail, sendEmail } from '@/lib/email/client';
import { HEBREW_ADVENTURE_NAME } from '@/lib/programs/names';
import { collectRecipientEmails, formatCoupleNames } from '@/lib/donations/couple-names';

export interface ChaiPartnerWelcomeEmailInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  monthlyAmount: number;
  accessCode: string;
  /** First monthly payment receipt — shown as a button at the bottom. */
  receiptUrl?: string;
  spouseFirstName?: string | null;
  spouseLastName?: string | null;
  spouseEmail?: string | null;
}

function formatMonthlyAmount(amount: number): string {
  return `$${amount.toFixed(2)}/month`;
}

export async function sendChaiPartnerWelcomeEmail(
  input: ChaiPartnerWelcomeEmailInput
): Promise<boolean> {
  const names = formatCoupleNames({
    firstName: input.firstName,
    lastName: input.lastName,
    spouseFirstName: input.spouseFirstName,
    spouseLastName: input.spouseLastName,
  });
  const monthly = formatMonthlyAmount(input.monthlyAmount);
  const recipients = collectRecipientEmails(input.email, input.spouseEmail);
  if (!recipients.length) return false;

  const html = buildEmailHtml(`
    <p style="text-align:center;font-family:Georgia,'Times New Roman',serif;font-size:28px;color:#b8902a;margin:0 0 8px;">חי</p>
    <p style="font-size:20px;color:#172643;font-weight:bold;margin:0 0 16px;">
      Thank you for becoming a HaBayit Chai Partner
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">
      Dear ${names.greeting},
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">
      We are grateful — <strong>thank you</strong>. Your monthly partnership of
      <strong>${monthly}</strong> means more than we can easily put into words. Chai Partners like
      you help sustain Shabbat, holidays, learning, and the warm Jewish home we are building
      together in Cooper City.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">
      We are deeply grateful that you have chosen to walk this path with HaBayit. Your generosity
      strengthens our community today and helps us grow for the families and children who will
      call HaBayit home tomorrow.
    </p>
    <div style="margin:24px 0;padding:20px 22px;background:#f7f3ea;border:1px solid #e4ded2;border-radius:12px;text-align:center;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;color:#6f6a60;">
        Your HaBayit Member Access Code
      </p>
      <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:bold;color:#b8902a;letter-spacing:0.06em;">
        ${input.accessCode}
      </p>
      <p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#6f6a60;">
        Please save this code. You will use it for member pricing on select HaBayit programs,
        including ${HEBREW_ADVENTURE_NAME}.
      </p>
    </div>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">
      <strong>What happens next?</strong><br>
      Your monthly gift of ${monthly} is now set up. Each month, your support helps keep HaBayit
      vibrant, welcoming, and alive with Torah, community, and joy.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">
      If you have questions, or if there is ever anything we can do for you, please reach out.
      We are honored to have you as part of the HaBayit family.
    </p>
    <p style="margin:0 0 4px;font-size:15px;line-height:1.7;">
      With heartfelt appreciation,
    </p>
    <p style="margin:0;font-size:15px;line-height:1.7;color:#172643;font-weight:bold;">
      Rabbi Shmuly &amp; Devora
    </p>
    ${
      input.receiptUrl
        ? `<div style="margin-top:28px;padding-top:20px;border-top:1px solid #e4ded2;text-align:center;">
      <p style="margin:0 0 4px;font-size:13px;line-height:1.6;color:#6f6a60;">
        Your tax receipt for this month&apos;s gift:
      </p>
      ${emailButton(input.receiptUrl, 'View &amp; Print Tax Receipt')}
    </div>`
        : ''
    }
  `);

  const [partnerSent] = await Promise.all([
    sendEmail({
      to: recipients,
      subject: 'Thank you for becoming a HaBayit Chai Partner',
      html,
    }),
    sendEmail({
      to: getAdminEmail(),
      subject: `New Chai Partner: ${names.receiptName} (${monthly})`,
      replyTo: input.email,
      html: buildEmailHtml(`
        <p style="font-size:16px;color:#172643;font-weight:bold;margin:0 0 12px;">
          New Chai Partner signup
        </p>
        <p style="margin:0 0 12px;line-height:1.7;">
          <strong>${names.receiptName}</strong><br>
          Email: ${recipients.join(', ')}<br>
          Phone: ${input.phone}<br>
          Monthly amount: ${monthly}<br>
          Access code: <strong>${input.accessCode}</strong>
        </p>
      `),
    }),
  ]);

  return partnerSent;
}
