import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Server clock in ms. The skate form uses it so a wrong device clock cannot show the wrong price. */
export async function GET() {
  return NextResponse.json({ now: Date.now() }, { headers: { 'Cache-Control': 'no-store' } });
}
