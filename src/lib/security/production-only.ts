import { NextResponse } from 'next/server';

export function isProductionDeployment(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** Hide diagnostic webhook GET handlers on the public internet. */
export function productionWebhookGetBlocked(): NextResponse | null {
  if (!isProductionDeployment()) return null;
  return NextResponse.json({ error: 'Not found.' }, { status: 404 });
}
