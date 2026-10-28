export type AdminRole = 'admin' | 'volunteer' | 'office' | 'teacher';

export type AdminCapability =
  | 'crm'
  | 'crm_finance'
  /** Payments tab excluding donate-page gifts and Chai. */
  | 'crm_event_payments'
  | 'emails'
  | 'photos'
  | 'registrations'
  | 'stripe_tools'
  | 'attendance';

/** CRM tabs volunteers must never see (money). */
export const VOLUNTEER_HIDDEN_CRM_VIEWS = ['donations', 'chai', 'payments', 'lulav'] as const;

/** CRM tabs office staff must never see (general donate + Chai). */
export const OFFICE_HIDDEN_CRM_VIEWS = ['donations', 'chai'] as const;

/** Payment source types office may not see. */
export const OFFICE_HIDDEN_PAYMENT_SOURCES = ['donation', 'chai_partner'] as const;

const ROLE_CAPABILITIES: Record<AdminRole, readonly AdminCapability[]> = {
  admin: [
    'crm',
    'crm_finance',
    'crm_event_payments',
    'emails',
    'photos',
    'registrations',
    'stripe_tools',
    'attendance',
  ],
  volunteer: ['crm', 'attendance'],
  office: ['crm', 'crm_event_payments', 'photos', 'registrations', 'attendance'],
  teacher: ['attendance'],
};

export function roleHasCapability(role: AdminRole, capability: AdminCapability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

export function isStaffRole(role: string): role is AdminRole {
  return role === 'admin' || role === 'volunteer' || role === 'office' || role === 'teacher';
}

export function crmViewsHiddenForRole(role: AdminRole): readonly string[] {
  if (role === 'admin') return [];
  if (role === 'office') return OFFICE_HIDDEN_CRM_VIEWS;
  if (role === 'teacher') return VOLUNTEER_HIDDEN_CRM_VIEWS;
  return VOLUNTEER_HIDDEN_CRM_VIEWS;
}

export function roleDisplayLabel(role: AdminRole): string | null {
  if (role === 'volunteer') return 'Volunteer access';
  if (role === 'office') return 'Office access';
  if (role === 'teacher') return 'Teacher access';
  return null;
}
