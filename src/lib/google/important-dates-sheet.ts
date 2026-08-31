import { google } from 'googleapis';
import { getHebrewAnnualSheetFields } from '@/lib/hebrew-birthday/hebrew-annual-order';

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_IMPORTANT_DATES_ID;

export const IMPORTANT_DATES_TABS = {
  birthday: 'Birthdays',
  yahrzeit: 'Yahrzeit',
} as const;

const HEADERS = {
  Birthdays: [
    'Updated',
    'Name',
    'Hebrew Month',
    'Hebrew Day',
    'In Year',
    'Year Order',
    'Gregorian Date',
    'Hebrew Date',
    'Hebrew Year',
    'Notes',
    'Family ID',
    'Child ID',
    'CRM ID',
  ],
  Yahrzeit: [
    'Updated',
    'Name',
    'Hebrew Month',
    'Hebrew Day',
    'In Year',
    'Year Order',
    'Gregorian Date',
    'Hebrew Date',
    'Hebrew Year',
    'Notes',
    'Family ID',
    'CRM ID',
  ],
} as const;

export type ImportantDateSheetType = keyof typeof IMPORTANT_DATES_TABS;

function nowET(): string {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!email || !key) throw new Error('Google service account credentials not set');

  return new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function tabForDateType(dateType: string): ImportantDateSheetType | null {
  if (dateType === 'birthday') return 'birthday';
  if (dateType === 'yahrzeit') return 'yahrzeit';
  return null;
}

async function ensureTab(spreadsheetId: string, tabName: keyof typeof HEADERS): Promise<void> {
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });
  const headers = HEADERS[tabName];

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
    });
  } catch {
    /* tab exists */
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabName}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[...headers]] },
  });

  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const sheetId =
    meta.data.sheets?.find((sheet) => sheet.properties?.title === tabName)?.properties?.sheetId ?? 0;

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
}

export async function createImportantDatesSheet(title = 'HaBayit Birthdays & Yahrzeit'): Promise<string> {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [
        { properties: { title: IMPORTANT_DATES_TABS.birthday } },
        { properties: { title: IMPORTANT_DATES_TABS.yahrzeit } },
      ],
    },
  });

  const spreadsheetId = created.data.spreadsheetId!;
  await ensureTab(spreadsheetId, 'Birthdays');
  await ensureTab(spreadsheetId, 'Yahrzeit');
  return spreadsheetId;
}

export async function setupImportantDatesSheet(spreadsheetId: string): Promise<void> {
  await ensureTab(spreadsheetId, 'Birthdays');
  await ensureTab(spreadsheetId, 'Yahrzeit');
}

function rowValues(
  tabName: keyof typeof HEADERS,
  data: {
    label: string;
    gregorianDate?: string | null;
    hebrewDate?: string | null;
    hebrewYear?: string | null;
    notes?: string | null;
    familyId?: string | null;
    childId?: string | null;
    crmId: string;
  },
): string[] {
  const annual = getHebrewAnnualSheetFields(data.hebrewDate);
  const base = [
    nowET(),
    data.label,
    annual.monthLabel,
    annual.day,
    annual.inYearLabel,
    annual.yearOrder,
    data.gregorianDate ?? '',
    data.hebrewDate ?? '',
    data.hebrewYear ?? '',
    data.notes ?? '',
    data.familyId ?? '',
  ];

  if (tabName === 'Birthdays') {
    return [...base, data.childId ?? '', data.crmId];
  }

  return [...base, data.crmId];
}

export async function syncImportantDateToSheet(data: {
  id: string;
  dateType: string;
  label: string;
  gregorianDate?: string | null;
  hebrewDate?: string | null;
  hebrewYear?: string | null;
  notes?: string | null;
  familyId?: string | null;
  childId?: string | null;
}): Promise<void> {
  const spreadsheetId = SPREADSHEET_ID;
  if (!spreadsheetId) return;

  const sheetType = tabForDateType(data.dateType);
  if (!sheetType) return;

  const tabName = IMPORTANT_DATES_TABS[sheetType] as keyof typeof HEADERS;
  const headers = HEADERS[tabName];
  const crmIdColumn = headers.indexOf('CRM ID');

  try {
    const sheets = google.sheets({ version: 'v4', auth: getAuth() });
    await ensureTab(spreadsheetId, tabName);

    const values = rowValues(tabName, { ...data, crmId: data.id });
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tabName}'!A:Z`,
    });

    const rows = existing.data.values ?? [];
    const matchIndex = rows.findIndex(
      (row, index) => index > 0 && row[crmIdColumn] === data.id,
    );

    if (matchIndex >= 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${tabName}'!A${matchIndex + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [values] },
      });
      return;
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${tabName}'!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [values] },
    });
  } catch (err) {
    console.error('[Sheets] important date sync failed:', err);
  }
}

export async function syncAllImportantDatesToSheet(
  rows: Array<{
    id: string;
    date_type: string;
    label: string;
    gregorian_date?: string | null;
    hebrew_date?: string | null;
    hebrew_year?: string | null;
    notes?: string | null;
    family_id?: string | null;
    child_id?: string | null;
  }>,
): Promise<{ synced: number; skipped: number }> {
  let synced = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!tabForDateType(row.date_type)) {
      skipped++;
      continue;
    }

    await syncImportantDateToSheet({
      id: row.id,
      dateType: row.date_type,
      label: row.label,
      gregorianDate: row.gregorian_date,
      hebrewDate: row.hebrew_date,
      hebrewYear: row.hebrew_year,
      notes: row.notes,
      familyId: row.family_id,
      childId: row.child_id,
    });
    synced++;
  }

  return { synced, skipped };
}
