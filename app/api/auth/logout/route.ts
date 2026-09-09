import { getSupabaseServer } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Sign-out.
 *
 * The browser client can clear its own copy of the session, but the httpOnly
 * cookies are set by the server and must be cleared there too — otherwise the
 * middleware would happily let the "logged out" visitor back into /compte on
 * the next request. POST-only so a prefetched link can never log anyone out.
 */
export async function POST() {
  if (!isSupabaseConfigured) return Response.json({ ok: true });

  const supabase = getSupabaseServer();
  // signOut() revokes the refresh token and expires the auth cookies.
  await supabase?.auth.signOut();

  return Response.json({ ok: true });
}
