import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * RGPD — Right to erasure.
 * Permanently deletes the authenticated user's account and associated data.
 *
 * Security: the user is identified from their own session cookie (never from a
 * client-supplied id), then deletion is performed with the service-role client.
 * Related rows are removed via ON DELETE CASCADE in the schema.
 */
export async function DELETE() {
  if (!isSupabaseConfigured) {
    return Response.json({ error: "Not configured" }, { status: 501 });
  }

  const supabase = getSupabaseServer();
  if (!supabase) {
    return Response.json({ error: "Not configured" }, { status: 501 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return Response.json(
      { error: "Server not configured for deletion" },
      { status: 501 }
    );
  }

  // Deleting the auth user cascades to public.profiles (and onward) via FKs.
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return Response.json({ error: "Deletion failed" }, { status: 500 });
  }

  // Invalidate the local session.
  await supabase.auth.signOut();

  return Response.json({ ok: true });
}
