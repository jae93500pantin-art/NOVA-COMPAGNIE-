import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { env, isSupabaseConfigured } from "@/lib/config";

/**
 * Server-side Supabase client bound to the request cookies.
 * Returns null when Supabase is not configured.
 *
 * Use inside Server Components, Route Handlers and Server Actions.
 */
export function getSupabaseServer() {
  if (!isSupabaseConfigured) return null;

  const cookieStore = cookies();

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options: CookieOptions;
        }[]
      ) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if middleware refreshes sessions.
        }
      },
    },
  });
}
