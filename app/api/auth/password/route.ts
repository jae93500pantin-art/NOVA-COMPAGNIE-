import { type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { rateLimit } from "@/lib/validation";
import { mapAuthError, passwordError } from "@/lib/authValidation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Step 2 of "forgot my password" (and the change-password action generally):
 * set a new password for whoever holds the current session cookie.
 *
 * Authorisation is the session itself — reached either through a recovery link
 * or by being logged in. The same password policy as registration applies, and
 * it is enforced here rather than in the form.
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured) {
    return Response.json({ error: "auth.errors.unconfigured" }, { status: 503 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const rl = rateLimit(`auth:password:${ip}`, 5, 10 * 60_000); // 5 / 10 min
  if (!rl.ok) {
    return Response.json(
      { error: "auth.errors.rateLimited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "auth.errorGeneric" }, { status: 400 });
  }

  const invalid = passwordError(body.password);
  if (invalid) {
    return Response.json({ fieldErrors: { password: invalid } }, { status: 422 });
  }

  const supabase = getSupabaseServer();
  if (!supabase) {
    return Response.json({ error: "auth.errors.unconfigured" }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  // No valid session means the recovery link expired or was never opened.
  if (!user) {
    return Response.json({ error: "auth.errors.linkExpired" }, { status: 401 });
  }

  const { error } = await supabase.auth.updateUser({
    password: body.password as string,
  });
  if (error) {
    return Response.json({ error: mapAuthError(error.message) }, { status: 400 });
  }

  return Response.json({ ok: true });
}
