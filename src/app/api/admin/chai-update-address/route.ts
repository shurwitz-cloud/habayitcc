import { NextRequest, NextResponse } from 'next/server';
import { requireCapabilityApi } from '@/lib/admin/guard';
import { createAdminClient } from '@/lib/supabase/server';
import { ensureCrmContact } from '@/lib/admin/ensure-contact';

export const dynamic = 'force-dynamic';

/**
 * Update Chai partner address (and related contact note).
 * POST /api/admin/chai-update-address
 */
export async function POST(req: NextRequest) {
  const denied = await requireCapabilityApi('crm_finance');
  if (denied) return denied;

  let body: {
    confirm?: boolean;
    email?: string;
    partnerId?: string;
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    firstName?: string;
    lastName?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  if (body.confirm !== true) {
    return NextResponse.json({ error: 'Pass { confirm: true }.' }, { status: 400 });
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const partnerId = (body.partnerId ?? '').trim();
  if (!email && !partnerId) {
    return NextResponse.json({ error: 'email or partnerId is required.' }, { status: 400 });
  }

  const street = (body.street ?? '').trim();
  const city = (body.city ?? '').trim();
  const state = (body.state ?? '').trim();
  const zip = (body.zip ?? '').trim();
  if (!street && !city && !state && !zip) {
    return NextResponse.json({ error: 'Provide at least one address field.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  let query = supabase
    .from('chai_partners')
    .select('id, first_name, last_name, email, phone, street_address, city, state, zip, family_id');
  if (partnerId) query = query.eq('id', partnerId);
  else query = query.ilike('email', email);

  const { data: partner, error: findError } = await query
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }
  if (!partner) {
    return NextResponse.json({ error: 'Chai partner not found.' }, { status: 404 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (street) patch.street_address = street;
  if (city) patch.city = city;
  if (state) patch.state = state;
  if (zip) patch.zip = zip;
  const firstName = (body.firstName ?? '').trim();
  const lastName = (body.lastName ?? '').trim();
  if (firstName) patch.first_name = firstName;
  if (lastName) patch.last_name = lastName;

  const { data: updated, error: updateError } = await supabase
    .from('chai_partners')
    .update(patch)
    .eq('id', partner.id)
    .select('id, first_name, last_name, email, street_address, city, state, zip')
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (partner.family_id) {
    await supabase
      .from('families')
      .update({
        street_address: street || partner.street_address,
        city: city || partner.city,
        state: state || partner.state,
        zip: zip || partner.zip,
        updated_at: new Date().toISOString(),
      })
      .eq('id', partner.family_id);
  }

  const addressLine = [street || partner.street_address, city || partner.city, state || partner.state, zip || partner.zip]
    .filter(Boolean)
    .join(', ');

  await ensureCrmContact({
    firstName: firstName || partner.first_name,
    lastName: lastName || partner.last_name,
    email: partner.email,
    phone: partner.phone,
    interest: 'Chai Partner',
    note: addressLine ? `Address: ${addressLine}` : null,
    forceName: Boolean(firstName || lastName),
    isResolved: true,
  });

  return NextResponse.json({ ok: true, partner: updated });
}
