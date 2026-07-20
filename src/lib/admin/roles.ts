export type AdminRole = 'admin' | 'volunteer';

export type AdminCapability =
  | 'crm'
  | 'crm_finance'
  | 'photos'
  | 'registrations'
  | 'stripe_tools';

/** CRM tabs volunteers must never see (money). */
export const VOLUNTEER_HIDDEN_CRM_VIEWS = ['donations', 'chai', 'payments'] as const;

const ROLE_CAPABILITIES: Record<AdminRole, readonly AdminCapability[]> = {
  admin: ['crm', 'crm_finance', 'photos', 'registrations', 'stripe_tools'],
  volunteer: ['crm'],
};

export function roleHasCapability(role: AdminRole, capability: AdminCapability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}
