import { type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { rateLimit, RECOVERY_PATH } from "@/lib/validation";
import { emailError, normalizeEmail } from "@/lib/authValidation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Step 1 of "forgot my password": send the recovery e-mail.
 *
 * The response is deliberately identical whether or not the address exists —
 * a different answer would turn this endpoint into an account-enumeration
 * oracle. The rate limit is what stops it being used to spam an inbox.
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured) {
    return Response.json({ error: "auth.errors.unconfigured" }, { status: 503 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const rl = rateLimit(`auth:reset:${ip}`, 3, 10 * 60_000); // 3 / 10 min
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

  const invalid = emailError(body.email);
  if (invalid) return Response.json({ fieldErrors: { email: invalid } }, { status: 422 });

  const supabase = getSupabaseServer();
  if (!supabase) {
    return Response.json({ error: "auth.errors.unconfigured" }, { status: 503 });
  }

  // Behind the Azure reverse proxy the request URL is the internal host.
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const origin = forwardedHost
    ? `${forwardedProto ?? "https"}://${forwardedHost}`
    : new URL(req.url).origin;

  // The link goes through /auth/callback, which exchanges the one-time code for
  // a session cookie before handing over to the new-password form.
  await supabase.auth.resetPasswordForEmail(normalizeEmail(body.email), {
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(RECOVERY_PATH)}`,
  });

  // Same answer in every case, on purpose (see above).
  return Response.json({ ok: true });
}
