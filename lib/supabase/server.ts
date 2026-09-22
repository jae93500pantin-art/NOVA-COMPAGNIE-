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
    /**
     * ⚠️ Même raison que dans `admin.ts` : Next.js met en cache les `fetch`
     * des Server Components, et supabase-js lit en GET. Ici l'enjeu est plus
     * grave que des données périmées — ce client porte le **jeton de session
     * de l'appelant**, donc une réponse mémorisée est celle d'un utilisateur
     * précis. On ne laisse pas le framework décider s'il est prudent de la
     * réutiliser.
     */
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store" }),
    },
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
