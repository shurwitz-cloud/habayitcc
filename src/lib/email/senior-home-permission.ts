import { buildEmailHtml, getAdminEmails, sendEmail, getPublicFrom } from './client';

export interface SeniorHomePermissionEmailInput {
  childName: string;
  parentName: string;
  email: string;
}

const OFFICE_EMAIL = 'office@habayitcc.org';

export async function sendSeniorHomePermissionEmails(
  input: SeniorHomePermissionEmailInput
): Promise<boolean> {
  const userHtml = buildEmailHtml(`
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Dear ${escapeHtml(input.parentName)},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Thank you! We’ve received your permission for
      <strong>${escapeHtml(input.childName)}</strong> to participate in the HaBayit
      senior home visit, including transportation by a designated adult driver.
    </p>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#6f6a60;">
      Together we can bring joy.
    </p>
  `);

  const adminHtml = buildEmailHtml(`
    <p style="margin:0 0 12px;font-size:15px;"><strong>New senior home visit permission</strong></p>
    <p style="margin:0;font-size:14px;line-height:1.7;">
      Child: ${escapeHtml(input.childName)}<br>
      Parent/Guardian: ${escapeHtml(input.parentName)}<br>
      Email: ${escapeHtml(input.email)}<br>
      Permission: YES — participate + transport by designated adult driver
    </p>
  `);

  const staffRecipients = Array.from(
    new Set([OFFICE_EMAIL, ...getAdminEmails()].map((e) => e.trim().toLowerCase()).filter(Boolean))
  );

  const [userSent, staffSent] = await Promise.all([
    sendEmail({
      to: input.email,
      subject: 'Permission received — Senior home visit | HaBayit',
      html: userHtml,
    }),
    sendEmail({
      to: staffRecipients,
      from: getPublicFrom(),
      replyTo: input.email,
      subject: `Senior home permission — ${input.childName}`,
      html: adminHtml,
    }),
  ]);

  if (!staffSent) {
    console.error(
      '[senior-home-permission] staff notification failed for',
      input.email,
      '→',
      staffRecipients.join(', ')
    );
  }

  return userSent;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
