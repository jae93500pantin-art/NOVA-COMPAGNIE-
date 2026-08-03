import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { avatarFromMetadata, nameFromMetadata } from "@/lib/identity";
import { safeReturnPath } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * OAuth return URL (Google & any other Supabase provider).
 * Exchanges the one-time code for a session cookie, mirrors the provider
 * profile into `public.profiles`, then sends the user back where they were.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  // Behind the Azure reverse proxy the request URL is http://internal-host.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const origin = forwardedHost
    ? `${forwardedProto ?? "https"}://${forwardedHost}`
    : url.origin;

  const next = safeReturnPath(url.searchParams.get("next"));
  const fail = (message: string) =>
    NextResponse.redirect(
      `${origin}/auth/login?auth_error=${encodeURIComponent(message)}`
    );

  const providerError =
    url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (providerError) return fail(providerError);

  const code = url.searchParams.get("code");
  if (!code) return fail("missing_code");

  const supabase = getSupabaseServer();
  if (!supabase) return fail("auth_unavailable");

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(error.message);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { firstName, lastName } = nameFromMetadata(user.user_metadata);
    const avatarUrl = avatarFromMetadata(user.user_metadata);
    // The row itself is created by the on_auth_user_created trigger; this
    // keeps it in sync for accounts that predate the provider link.
    const patch: Record<string, string> = {};
    if (firstName) patch.first_name = firstName;
    if (lastName) patch.last_name = lastName;
    if (avatarUrl) patch.avatar_url = avatarUrl;
    if (Object.keys(patch).length > 0) {
      // Best effort: a failing profile sync must not break the sign-in.
      await supabase.from("profiles").update(patch).eq("id", user.id);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
