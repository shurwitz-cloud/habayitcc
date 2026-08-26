import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';

/**
 * Supabase client for use in Server Components, Server Actions, and Route Handlers.
 * Uses the public anon key for now (Phase 1 has no auth). Once Supabase Auth is
 * introduced, this same client will automatically pick up the user's session
 * via cookies without any structural changes.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if middleware is refreshing sessions.
          }
        },
      },
    }
  );
}

export function getServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined;
}

export function isServiceRoleConfigured(): boolean {
  const key = getServiceRoleKey();
  return Boolean(key && key.length > 20);
}

/**
 * Admin client using the service role key — bypasses RLS entirely.
 * Use ONLY in trusted server-side code (Server Actions, Route Handlers,
 * webhooks) that needs to write data without a logged-in user context,
 * e.g. saving a donation or Chai Partner signup from a public form.
 * NEVER expose the service role key to the browser.
 */
export function createAdminClient() {
  const serviceRoleKey = getServiceRoleKey();
  if (!serviceRoleKey) {
    console.error(
      '[supabase] SUPABASE_SERVICE_ROLE_KEY is missing — database writes will fail after RLS is enabled.'
    );
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required in production.');
    }
  }

  const key = serviceRoleKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!key) {
    throw new Error('Supabase credentials are not configured.');
  }

  return createSupabaseJsClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { persistSession: false } }
  );
}
