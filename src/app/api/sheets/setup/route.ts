import { NextResponse } from 'next/server';
import { createSheet, setupSheet, SHEET_CONFIGS } from '@/lib/google/sheets';

const SHEET_TITLES: Record<string, string> = {
  contact:      'HaBayit Contact',
  donations:    'HaBayit Donations',
  chaiPartners: 'HaBayit Chai Partners',
  hebrewSchool: 'HaBayit Hebrew School',
};

/**
 * GET /api/sheets/setup
 *
 * Two modes:
 *
 * 1. IDs not set in .env.local → CREATES all 4 spreadsheets from scratch,
 *    sets up "Responses" tab with bold frozen headers, and returns the new
 *    IDs. Copy those IDs into .env.local, then call this endpoint again.
 *
 * 2. IDs already set → ensures headers are in place (idempotent refresh).
 *
 * Requires GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
 * to be set before calling.
 */
export async function GET() {
  if (
    !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    !process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  ) {
    return NextResponse.json(
      {
        error:
          'GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY must be set in .env.local first.',
      },
      { status: 500 }
    );
  }

  const results: Record<string, { status: string; spreadsheetId?: string; url?: string }> = {};
  let createdAny = false;

  for (const [key, config] of Object.entries(SHEET_CONFIGS)) {
    try {
      if (!config.id) {
        // No ID yet — create the spreadsheet
        const newId = await createSheet(SHEET_TITLES[key], [...config.headers]);
        results[key] = {
          status: 'created',
          spreadsheetId: newId,
          url: `https://docs.google.com/spreadsheets/d/${newId}/edit`,
        };
        createdAny = true;
      } else {
        // ID exists — just ensure headers are in place
        await setupSheet(config.id, [...config.headers]);
        results[key] = { status: 'headers refreshed', spreadsheetId: config.id };
      }
    } catch (err) {
      results[key] = {
        status: `error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return NextResponse.json({
    message: createdAny
      ? '✅ Spreadsheets created! Copy the spreadsheetId values below into .env.local, then call this endpoint again to confirm.'
      : '✅ All sheets ready.',
    sheets: results,
  });
}
