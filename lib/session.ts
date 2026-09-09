import "server-only";

import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";

/**
 * Server-side identity, derived from the **session cookie** only.
 *
 * This is the counterpart of `lib/admin.ts` for ordinary users: Server
 * Components, Server Actions and route handlers ask this module who the caller
 * is instead of believing an id sent in a request body (see CLAUDE.md §
 * Architecture principles, point 2).
 *
 * Graceful degradation: with no Supabase keys the app runs its localStorage
 * demo session, which the server cannot see. `getServerUser()` then reports
 * `unconfigured` and callers must fall back to the client-side guard rather
 * than locking the demo out.
 */

export type SessionRole = "client" | "driver" | "admin";
export type ProfileStatus = "pending" | "approved" | "rejected";

export interface ServerUser {
  id: string;
  email: string | null;
  role: SessionRole;
  status: ProfileStatus;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  /**
   * Profil chauffeur public piloté par ce compte (`lib/drivers.ts`).
   * Null pour un client, et null aussi pour un chauffeur pas encore rattaché —
   * l'annuaire est encore constitué de données fixes, sans lien vers un compte.
   */
  driverSlug: string | null;
}

export type SessionState =
  | { state: "unconfigured" }
  | { state: "anonymous" }
  | { state: "ok"; user: ServerUser };

export async function getServerUser(): Promise<SessionState> {
  if (!isSupabaseConfigured) return { state: "unconfigured" };

  const supabase = getSupabaseServer();
  if (!supabase) return { state: "unconfigured" };

  // getUser() revalidates the JWT with Supabase; getSession() would only decode
  // a cookie the browser controls.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { state: "anonymous" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status, first_name, last_name, avatar_url, driver_slug")
    .eq("id", user.id)
    .single();

  return {
    state: "ok",
    user: {
      id: user.id,
      email: user.email ?? null,
      // The profile row is created by the on_auth_user_created trigger. If it
      // is momentarily missing, treat the account as a plain client rather than
      // failing the request.
      role: (profile?.role as SessionRole) ?? "client",
      status: (profile?.status as ProfileStatus) ?? "approved",
      firstName: profile?.first_name ?? "",
      lastName: profile?.last_name ?? "",
      avatarUrl: profile?.avatar_url ?? null,
      // Le compte de démonstration porte son profil dans les métadonnées ;
      // un vrai compte le porte en base, posé par un administrateur.
      driverSlug:
        (profile?.driver_slug as string | null) ??
        ((user.user_metadata?.driver_id as string) || null),
    },
  };
}

/**
 * Page-level guard for a Server Component. Sends anonymous visitors to the
 * login form with a `?next=` so they land back where they were heading.
 *
 * Returns `null` in demo mode — the caller keeps rendering and the client-side
 * guard takes over.
 */
export async function requireUser(nextPath: string): Promise<ServerUser | null> {
  const session = await getServerUser();
  if (session.state === "unconfigured") return null;
  if (session.state === "anonymous")
    redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);
  return session.user;
}
