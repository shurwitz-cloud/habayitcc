import { readFileSync } from 'fs';
import { resolve } from 'path';
import { google } from 'googleapis';

const envPath = resolve(process.cwd(), '.env.local');
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx === -1) continue;
  const key = trimmed.slice(0, idx).trim();
  let value = trimmed.slice(idx + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  process.env[key] ??= value;
}

const spreadsheetId = process.env.GOOGLE_SHEETS_DONATIONS_ID;
const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!spreadsheetId || !email || !key) {
  console.error('Missing GOOGLE_SHEETS_DONATIONS_ID or Google service account credentials.');
  process.exit(1);
}

const headers = [
  'Timestamp', 'First Name', 'Last Name', 'Email', 'Phone', 'Amount',
  'Memo', 'Notes', 'Monthly', 'Stripe Payment Intent ID',
];

const auth = new google.auth.JWT({
  email,
  key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const TAB = 'Responses';

try {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
  });
} catch {
  /* tab exists */
}

await sheets.spreadsheets.values.update({
  spreadsheetId,
  range: `${TAB}!A1`,
  valueInputOption: 'USER_ENTERED',
  requestBody: { values: [headers] },
});

console.log(JSON.stringify({
  ok: true,
  spreadsheetId,
  url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  headers,
}, null, 2));
