import { NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { syncContactsFromCrmPeople } from '@/lib/admin/ensure-contact';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/admin/sync-contacts
 * Backfill Contacts from chai_partners, event_registrations, donations.
 * Quiet — no emails.
 */
export async function POST() {
  const denied = await requireCapabilityApi('stripe_tools');
  if (denied) return denied;

  try {
    const stats = await syncContactsFromCrmPeople();
    return NextResponse.json({
      success: true,
      quiet: true,
      emailsSent: false,
      stats,
    });
  } catch (err) {
    console.error('[sync-contacts]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 500 },
    );
  }
}
