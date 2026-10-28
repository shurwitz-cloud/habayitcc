/**
 * Helpers for Supabase inserts when production may be missing newer columns
 * (migrations not yet applied). Strips unknown columns and retries.
 */

export function isSchemaColumnError(message?: string | null): boolean {
  if (!message) return false;
  return (
    /column .* does not exist/i.test(message) ||
    /Could not find the .* column/i.test(message)
  );
}

function columnFromError(message: string): string | null {
  const patterns = [
    /Could not find the '([^']+)' column/i,
    /column "([^"]+)" of relation/i,
    /column ([^\s]+) does not exist/i,
  ];
  for (const re of patterns) {
    const m = message.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

export function omitColumn<T extends Record<string, unknown>>(
  row: T,
  column: string
): T {
  const { [column]: _removed, ...rest } = row;
  return rest as T;
}

export async function insertWithSchemaFallback<
  T extends Record<string, unknown>,
  R,
>(
  row: T,
  insert: (payload: T) => Promise<{ data: R | null; error: { message: string } | null }>,
  maxAttempts = 8
): Promise<{ data: R | null; error: { message: string } | null }> {
  let payload = row;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await insert(payload);
    if (!result.error) return result;

    if (!isSchemaColumnError(result.error.message)) {
      return result;
    }

    const column = columnFromError(result.error.message);
    if (!column || !(column in payload)) {
      return result;
    }

    console.warn(`[supabase] Retrying insert without column: ${column}`);
    payload = omitColumn(payload, column);
  }

  return insert(payload);
}
