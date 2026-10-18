/** English name with Hebrew (or other) name in parentheses when present. */
export function formatChildDisplayName(
  firstName: string,
  lastName: string,
  hebrewName?: string | null,
): string {
  const full = `${firstName} ${lastName}`.trim();
  const hebrew = hebrewName?.trim();
  if (!hebrew) return full;
  // Avoid "Amalia Amalia" / duplicate English-only CRM placeholders.
  if (hebrew.toLowerCase() === firstName.trim().toLowerCase()) return full;
  if (hebrew.toLowerCase() === full.toLowerCase()) return full;
  return `${full} (${hebrew})`;
}
