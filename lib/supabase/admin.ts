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
  });
}
