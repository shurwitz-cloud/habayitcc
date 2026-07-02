import { google } from 'googleapis';

// One spreadsheet per form — set these in .env.local
const IDS = {
  contact:      process.env.GOOGLE_SHEETS_CONTACT_ID,
  donations:    process.env.GOOGLE_SHEETS_DONATIONS_ID,
  chaiPartners: process.env.GOOGLE_SHEETS_CHAI_PARTNERS_ID,
  hebrewAdventure: process.env.GOOGLE_SHEETS_HEBREW_SCHOOL_ID,
  achim:        process.env.GOOGLE_SHEETS_ACHIM_ID,
  bloom:        process.env.GOOGLE_SHEETS_BLOOM_ID,
} as const;

const TAB = 'Responses'; // single tab in each spreadsheet

function nowET(): string {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key   = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!email || !key) throw new Error('Google service account credentials not set');

  return new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// ── Core append — used by all typed helpers ──────────────────────────────────

async function appendRow(
  spreadsheetId: string,
  values: (string | number | boolean)[]
): Promise<void> {
  try {
    const sheets = google.sheets({ version: 'v4', auth: getAuth() });
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${TAB}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [values.map(String)] },
    });
  } catch (err) {
    console.error('[Sheets] append failed:', err);
  }
}

// ── Setup helpers ────────────────────────────────────────────────────────────

/**
 * Creates a brand-new Google Spreadsheet with the given title,
 * renames Sheet1 to "Responses", and writes the header row.
 * Returns the new spreadsheet ID.
 */
export async function createSheet(title: string, headers: string[]): Promise<string> {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // Create the spreadsheet
  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [{ properties: { title: TAB } }],
    },
  });

  const spreadsheetId = created.data.spreadsheetId!;

  // Write header row
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${TAB}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [headers] },
  });

  // Make the header row bold + frozen
  const sheetId = created.data.sheets?.[0].properties?.sheetId ?? 0;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat.textFormat.bold',
          },
        },
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount',
          },
        },
      ],
    },
  });

  return spreadsheetId;
}

/**
 * Initialises an existing spreadsheet — creates the Responses tab if
 * missing and writes (or overwrites) the header row.
 */
export async function setupSheet(
  spreadsheetId: string,
  headers: string[]
): Promise<void> {
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
    });
  } catch { /* tab already exists */ }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${TAB}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [headers] },
  });
}

// ── Sheet definitions ────────────────────────────────────────────────────────

export const SHEET_CONFIGS = {
  contact: {
    id: IDS.contact,
    headers: ['Timestamp', 'First Name', 'Last Name', 'Email', 'Phone', 'Interest', 'Message'],
  },
  donations: {
    id: IDS.donations,
    headers: [
      'Timestamp', 'First Name', 'Last Name', 'Email', 'Phone', 'Amount',
      'Memo', 'Notes', 'Monthly', 'Stripe Payment Intent ID',
    ],
  },
  chaiPartners: {
    id: IDS.chaiPartners,
    headers: [
      'Timestamp', 'First Name', 'Last Name', 'Email', 'Phone',
      'Street', 'City', 'State', 'ZIP', 'Monthly Amount',
      'Access Code', 'Stripe Subscription ID', 'Stripe Customer ID',
    ],
  },
  hebrewAdventure: {
    id: IDS.hebrewAdventure,
    headers: [
      'Timestamp',
      'Parent 1 First', 'Parent 1 Last', 'Parent 1 Email', 'Parent 1 Phone',
      'Parent 2 First', 'Parent 2 Last', 'Parent 2 Email', 'Parent 2 Phone',
      'Street', 'City', 'State', 'ZIP',
      'Emergency Contact', 'Emergency Phone',
      'Chai Partner?', 'Chai Code', 'Payment Plan', 'Notes',
      'Child 1 First', 'Child 1 Last', 'Child 1 Hebrew Name', 'Child 1 DOB',
      'Child 1 Grade', 'Child 1 School', 'Child 1 Hebrew Level', 'Child 1 Allergies',
      'Child 2 First', 'Child 2 Last', 'Child 2 Hebrew Name', 'Child 2 DOB',
      'Child 2 Grade', 'Child 2 School', 'Child 2 Hebrew Level', 'Child 2 Allergies',
      'Child 3 First', 'Child 3 Last', 'Child 3 Hebrew Name', 'Child 3 DOB',
      'Child 3 Grade', 'Child 3 School', 'Child 3 Hebrew Level', 'Child 3 Allergies',
    ],
  },
} as const;

// ── Typed row helpers ────────────────────────────────────────────────────────

export function contactRow(data: {
  firstName: string; lastName: string; email: string;
  phone: string; interest: string; message: string;
}) {
  if (!IDS.contact) return;
  return appendRow(IDS.contact, [
    nowET(), data.firstName, data.lastName, data.email,
    data.phone, data.interest, data.message,
  ]);
}

function formatDonationNotes(
  dedicationName?: string,
  dedicationType?: string
): string {
  const name = dedicationName?.trim();
  if (!name) return '';
  const prefix = dedicationType === 'memory' ? 'In memory of' : 'In honor of';
  return `${prefix} ${name}`;
}

export function donationRow(data: {
  firstName: string; lastName: string; email: string; phone?: string;
  amount: number; paymentIntentId: string;
  memo?: string; dedicationName?: string; dedicationType?: string;
  donationType: 'One-Time' | 'Monthly';
}) {
  if (!IDS.donations) return;
  return appendRow(IDS.donations, [
    nowET(),
    data.firstName,
    data.lastName,
    data.email,
    data.phone ?? '',
    `$${data.amount.toFixed(2)}`,
    data.memo ?? '',
    formatDonationNotes(data.dedicationName, data.dedicationType),
    data.donationType === 'Monthly' ? 'monthly' : '',
    data.paymentIntentId,
  ]);
}

export function chaiPartnerRow(data: {
  firstName: string; lastName: string; email: string; phone: string;
  street: string; city: string; state: string; zip: string;
  monthlyAmount: number; accessCode: string;
  subscriptionId: string; customerId: string;
}) {
  if (!IDS.chaiPartners) return;
  return appendRow(IDS.chaiPartners, [
    nowET(), data.firstName, data.lastName, data.email, data.phone,
    data.street, data.city, data.state, data.zip,
    `$${data.monthlyAmount.toFixed(2)}`,
    data.accessCode, data.subscriptionId, data.customerId,
  ]);
}

// ── RSVP — auto-creates tab on first submission ──────────────────────────────

const RSVP_HEADERS = ['Timestamp', 'First Name', 'Last Name', 'Email', 'Phone', '# Attending', 'Notes'];

/**
 * Appends an RSVP row to a named tab inside a spreadsheet.
 * If the tab doesn't exist yet it is created with a header row automatically.
 */
export async function appendRsvpToTab(
  spreadsheetId: string,
  tabName: string,
  data: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    attending: number;
    notes: string;
  }
): Promise<void> {
  try {
    const sheets = google.sheets({ version: 'v4', auth: getAuth() });

    // Try to create the tab — silently skip if it already exists
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
      });
      // Tab was just created — write headers + freeze row
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${tabName}'!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [RSVP_HEADERS] },
      });
      const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
      const sheetId = meta.data.sheets?.find(
        (s) => s.properties?.title === tabName
      )?.properties?.sheetId ?? 0;
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
                cell: { userEnteredFormat: { textFormat: { bold: true } } },
                fields: 'userEnteredFormat.textFormat.bold',
              },
            },
            {
              updateSheetProperties: {
                properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
                fields: 'gridProperties.frozenRowCount',
              },
            },
          ],
        },
      });
    } catch { /* tab already existed */ }

    // Append the RSVP row
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${tabName}'!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[
          nowET(),
          data.firstName,
          data.lastName,
          data.email,
          data.phone,
          String(data.attending),
          data.notes,
        ]],
      },
    });
  } catch (err) {
    console.error('[Sheets] RSVP append failed:', err);
  }
}

export { IDS as SHEET_IDS };

export function hebrewAdventureRow(data: {
  parent1First: string; parent1Last: string; parent1Email: string; parent1Phone: string;
  parent2First: string; parent2Last: string; parent2Email: string; parent2Phone: string;
  street: string; city: string; state: string; zip: string;
  emergencyContact: string; emergencyPhone: string;
  isChaiPartner: boolean; chaiCode: string; paymentPlan: string; notes: string;
  children: Array<{
    firstName: string; lastName: string; hebrewName: string; dateOfBirth: string;
    grade: string; schoolAttending: string; hebrewLevel: string; allergies: string;
  }>;
}) {
  if (!IDS.hebrewAdventure) return;

  const childCols: string[] = [];
  for (let i = 0; i < 3; i++) {
    const c = data.children[i];
    if (c) {
      childCols.push(c.firstName, c.lastName, c.hebrewName, c.dateOfBirth,
        c.grade, c.schoolAttending, c.hebrewLevel, c.allergies);
    } else {
      childCols.push('', '', '', '', '', '', '', '');
    }
  }

  return appendRow(IDS.hebrewAdventure, [
    nowET(),
    data.parent1First, data.parent1Last, data.parent1Email, data.parent1Phone,
    data.parent2First, data.parent2Last, data.parent2Email, data.parent2Phone,
    data.street, data.city, data.state, data.zip,
    data.emergencyContact, data.emergencyPhone,
    data.isChaiPartner ? 'Yes' : 'No', data.chaiCode,
    data.paymentPlan, data.notes,
    ...childCols,
  ]);
}
