import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env, serverEnv, isSupabaseAdminConfigured } from "@/lib/config";

/**
 * Privileged Supabase client using the service role key.
 *
 * SERVER ONLY. The `server-only` import guarantees a build error if this module
 * is ever pulled into a Client Component. Bypasses RLS — use exclusively for
 * vetted admin operations (e.g. RGPD account deletion) after verifying the
 * caller's identity.
 */
export function getSupabaseAdmin() {
  if (!isSupabaseAdminConfigured) return null;
  return createClient(env.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: uncachedFetch },
  });
}

/**
 * ⚠️ **Next.js met en cache les `fetch` des Server Components, y compris ceux
 * que supabase-js émet sous le capot.** Les lectures PostgREST sont des GET :
 * elles atterrissent donc dans le Data Cache, persisté sur disque dans
 * `.next/cache` — il survit même à un redémarrage.
 *
 * Symptôme observé : un chauffeur validé par un administrateur n'apparaissait
 * pas sur `/drivers`, alors que sa fiche `/drivers/<slug>` s'affichait très
 * bien. Les deux appels ont des URL différentes, donc des entrées de cache
 * différentes : la liste avait été mise en cache quand la table était encore
 * vide, la fiche appelée après. `export const dynamic = "force-dynamic"` sur
 * la page ne suffit pas — il rend la page dynamique, il ne vide pas les
 * entrées déjà écrites.
 *
 * La base fait autorité : aucune de ses réponses ne doit être mémorisée par le
 * framework. `no-store` est donc posé sur le client lui-même plutôt que sur
 * chaque appelant, parce qu'un appelant qui l'oublie ne produit pas une erreur
 * — il produit une donnée périmée, ce qui ne se voit pas.
 */
function uncachedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return fetch(input, { ...init, cache: "no-store" });
}
