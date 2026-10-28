import { NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import {
  importHistoricalMembers,
  type HistoricalImportFile,
} from '@/lib/admin/import-historical-members';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/admin/import-historical-members
 * Body JSON: { files: [{ filename: string, csvText: string }] }
 * Quiet multi-file import — no emails.
 */
export async function POST(request: Request) {
  const denied = await requireCapabilityApi('stripe_tools');
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected JSON body' }, { status: 400 });
  }

  const filesRaw = (body as { files?: unknown })?.files;
  if (!Array.isArray(filesRaw) || filesRaw.length === 0) {
    return NextResponse.json(
      { error: 'Expected { files: [{ filename, csvText }] }' },
      { status: 400 },
    );
  }

  const files: HistoricalImportFile[] = [];
  for (const item of filesRaw) {
    if (!item || typeof item !== 'object') continue;
    const filename = String((item as { filename?: unknown }).filename || '').trim();
    const csvText = String((item as { csvText?: unknown }).csvText || '');
    if (!filename || !csvText.trim()) {
      return NextResponse.json(
        { error: 'Each file needs filename and csvText' },
        { status: 400 },
      );
    }
    files.push({ filename, csvText });
  }

  if (!files.length) {
    return NextResponse.json({ error: 'No valid files in body' }, { status: 400 });
  }

  try {
    const stats = await importHistoricalMembers(files);
    return NextResponse.json({
      success: true,
      quiet: true,
      emailsSent: false,
      stats,
    });
  } catch (err) {
    console.error('[import-historical-members]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Import failed' },
      { status: 500 },
    );
  }
}
