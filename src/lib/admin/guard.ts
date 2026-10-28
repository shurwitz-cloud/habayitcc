import { NextResponse } from 'next/server';
import {
  isAdminAuthenticated,
  requireCapability,
  type AdminCapability,
} from './auth';

export async function requireAdminApi(): Promise<NextResponse | null> {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function requireCapabilityApi(
  capability: AdminCapability
): Promise<NextResponse | null> {
  if (!(await requireCapability(capability))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}
