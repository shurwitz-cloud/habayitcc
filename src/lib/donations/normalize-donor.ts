/** Normalize donor email for Stripe metadata + server verification. */
export function normalizeDonorEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeDonorName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.replace(/\s+/g, ' ').trim();
}
