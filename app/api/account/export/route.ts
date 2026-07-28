import { getSupabaseServer } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * RGPD — Right of access & portability.
 * Returns a JSON copy of all data held about the authenticated user.
 */
export async function GET() {
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

  const [profile, driver, bookings, reviews, messages] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("drivers").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("bookings").select("*").eq("client_id", user.id),
    supabase.from("reviews").select("*").eq("author_id", user.id),
    supabase.from("messages").select("*").eq("sender_id", user.id),
  ]);

  return Response.json(
    {
      generatedAt: new Date().toISOString(),
      account: { id: user.id, email: user.email },
      profile: profile.data,
      driverProfile: driver.data,
      bookings: bookings.data ?? [],
      reviews: reviews.data ?? [],
      messages: messages.data ?? [],
    },
    {
      headers: {
        "Content-Disposition": 'attachment; filename="jw-company-mes-donnees.json"',
      },
    }
  );
}
