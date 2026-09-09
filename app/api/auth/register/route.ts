import { type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { rateLimit } from "@/lib/validation";
import { mapAuthError, validateRegistration } from "@/lib/authValidation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Account creation.
 *
 * The browser could call `supabase.auth.signUp` directly, but then our own
 * business rules (a real first/last name, a plausible phone, a password policy)
 * would live only in the form — one `fetch` away from being skipped. Signing up
 * from the server makes the validation authoritative, adds a rate limit, and
 * lets us return stable error *keys* instead of English Supabase sentences.
 *
 * On success the `@supabase/ssr` server client writes the session cookie
 * itself, so the caller is logged in as soon as the response lands — unless the
 * project requires e-mail confirmation, which we report back explicitly.
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured) {
    // No keys: the app runs its localStorage demo, which never reaches here.
    return Response.json({ error: "auth.errors.unconfigured" }, { status: 503 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const rl = rateLimit(`auth:register:${ip}`, 5, 60_000); // 5 / min
  if (!rl.ok) {
    return Response.json(
      { error: "auth.errors.rateLimited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "auth.errorGeneric" }, { status: 400 });
  }

  const parsed = validateRegistration(body as Record<string, unknown>);
  if (!parsed.ok) {
    return Response.json({ fieldErrors: parsed.errors }, { status: 422 });
  }
  const { email, password, firstName, lastName, phone, role } = parsed.value;

  const supabase = getSupabaseServer();
  if (!supabase) {
    return Response.json({ error: "auth.errors.unconfigured" }, { status: 503 });
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Consumed by the on_auth_user_created trigger, which writes the
      // public.profiles row (and puts drivers in the approval queue).
      data: { role, first_name: firstName, last_name: lastName, phone },
    },
  });

  if (error) {
    const key = mapAuthError(error.message);
    return Response.json(
      { error: key },
      { status: key === "auth.errors.emailTaken" ? 409 : 400 }
    );
  }

  // Supabase deliberately returns a decoy user with an empty `identities` array
  // when the address already exists, so an attacker cannot enumerate accounts.
  // We keep that property: an existing address gets the same "check your inbox"
  // answer as a fresh one.
  const needsEmailConfirmation = !data.session;

  return Response.json({ ok: true, needsEmailConfirmation, role });
}
