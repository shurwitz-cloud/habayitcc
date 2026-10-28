import { NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { importStripeCustomersCsv } from '@/lib/admin/import-stripe-customers';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/admin/import-stripe-customers
 * Body: raw CSV text (Stripe unified_customers export)
 * Quiet import — no emails.
 */
export async function POST(request: Request) {
  const denied = await requireCapabilityApi('stripe_tools');
  if (denied) return denied;

  const csvText = await request.text();
  if (!csvText.trim() || !csvText.includes('Email')) {
    return NextResponse.json(
      { error: 'Expected Stripe unified_customers CSV body' },
      { status: 400 },
    );
  }

  try {
    const stats = await importStripeCustomersCsv(csvText);
    return NextResponse.json({
      success: true,
      quiet: true,
      emailsSent: false,
      stats,
    });
  } catch (err) {
    console.error('[import-stripe-customers]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Import failed' },
      { status: 500 },
    );
  }
}
