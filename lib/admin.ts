import "server-only";

import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabaseConfigured, isSupabaseAdminConfigured } from "@/lib/config";

/**
 * Admin authorisation guard, shared by the /admin dashboard and the admin API
 * routes.
 *
 * Identity always comes from the **session cookie** (never from client-supplied
 * ids), then the `profiles.role` column decides. Reads and writes performed
 * afterwards use the service-role client: an admin console legitimately needs
 * to see rows that RLS scopes to their owner.
 *
 * Graceful degradation (see CLAUDE.md § Architecture principles): without
 * Supabase keys the whole back-office reports `unconfigured` instead of
 * crashing, so the no-keys demo keeps working.
 */
export type AdminGuard =
  | { state: "unconfigured" }
  | { state: "no-service-role" }
  | { state: "anonymous" }
  | { state: "forbidden" }
  | { state: "ok"; userId: string };

export async function requireAdmin(): Promise<AdminGuard> {
  if (!isSupabaseConfigured) return { state: "unconfigured" };
  if (!isSupabaseAdminConfigured) return { state: "no-service-role" };

  const supabase = getSupabaseServer();
  if (!supabase) return { state: "unconfigured" };

  // getUser() revalidates the JWT against Supabase — getSession() only decodes
  // the cookie, which a client could have tampered with.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { state: "anonymous" };

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (error || profile?.role !== "admin") return { state: "forbidden" };

  return { state: "ok", userId: user.id };
}

/** Service-role client, for use only after `requireAdmin()` returned "ok". */
export function adminDb() {
  return getSupabaseAdmin();
}
