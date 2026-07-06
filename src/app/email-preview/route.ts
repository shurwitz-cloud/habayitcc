import { buildEmailHtml, emailButton, getSiteUrl } from '@/lib/email/client';

function donationPreviewHtml(): string {
  const receiptUrl = `${getSiteUrl()}/receipt?name=Shmuel+Hurwitz&amount=72.00&date=07%2F02%2F2026&method=Credit+Card`;

  return buildEmailHtml(`
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Dear Shmuel Hurwitz,</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#282828;">
      Thank you for your generous monthly gift of <strong>$72.00/month</strong>. Your recurring support means the world to HaBayit. Your tax receipt for this payment is ready to view and print.
    </p>
    ${emailButton(receiptUrl, 'View &amp; Print Tax Receipt')}
  `);
}

function rsvpPreviewHtml(): string {
  return buildEmailHtml(`
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Dear Shmuel,</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      You're registered for <strong>HaBayit Achim</strong>.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.6;margin:0 0 16px;">
      <tr><td style="padding:6px 0;color:#6f6a60;width:120px;">Event</td><td style="padding:6px 0;"><strong>Open House</strong></td></tr>
      <tr><td style="padding:6px 0;color:#6f6a60;">Date</td><td style="padding:6px 0;">Monday, July 28th · 7:30 PM</td></tr>
      <tr><td style="padding:6px 0;color:#6f6a60;">Attending</td><td style="padding:6px 0;">2</td></tr>
    </table>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#6f6a60;">See habayitcc.org/events for location details.</p>
    <p style="margin:16px 0 0;font-size:14px;line-height:1.6;">We look forward to seeing you!</p>
  `);
}

export async function GET(request: Request) {
  const template = new URL(request.url).searchParams.get('template') ?? 'donation';
  const html = template === 'rsvp' ? rsvpPreviewHtml() : donationPreviewHtml();

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
