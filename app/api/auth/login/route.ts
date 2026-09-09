import { type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { rateLimit, safeReturnPath } from "@/lib/validation";
import { mapAuthError, validateLogin } from "@/lib/authValidation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Password sign-in.
 *
 * Two rate-limit buckets on purpose: one per IP (a single host hammering many
 * accounts) and one per address (a botnet spread across IPs hammering one
 * account). Neither alone stops credential stuffing.
 *
 * On success `@supabase/ssr` sets the session cookie on the response, so the
 * session is established by the time the browser reads the JSON.
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured) {
    return Response.json({ error: "auth.errors.unconfigured" }, { status: 503 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const byIp = rateLimit(`auth:login:ip:${ip}`, 10, 60_000); // 10 / min
  if (!byIp.ok) {
    return Response.json(
      { error: "auth.errors.rateLimited" },
      { status: 429, headers: { "Retry-After": String(byIp.retryAfter) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "auth.errorGeneric" }, { status: 400 });
  }

  const parsed = validateLogin(body);
  if (!parsed.ok) {
    return Response.json({ fieldErrors: parsed.errors }, { status: 422 });
  }
  const { email, password } = parsed.value;

  const byAccount = rateLimit(`auth:login:acct:${email}`, 8, 5 * 60_000); // 8 / 5 min
  if (!byAccount.ok) {
    return Response.json(
      { error: "auth.errors.rateLimited" },
      { status: 429, headers: { "Retry-After": String(byAccount.retryAfter) } }
    );
  }

  const supabase = getSupabaseServer();
  if (!supabase) {
    return Response.json({ error: "auth.errors.unconfigured" }, { status: 503 });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return Response.json({ error: mapAuthError(error?.message) }, { status: 401 });
  }

  // Role and approval status come from the database, never from the payload.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", data.user.id)
    .single();

  const role = (profile?.role as string) ?? "client";

  return Response.json({
    ok: true,
    role,
    status: (profile?.status as string) ?? "approved",
    // Admins land in the back-office; everyone else in their account space or
    // wherever they were headed before the login form interrupted them.
    redirectTo:
      role === "admin" ? "/admin" : safeReturnPath(body.next as string | null),
  });
}
