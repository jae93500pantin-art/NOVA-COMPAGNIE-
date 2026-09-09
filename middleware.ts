import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { env, isSupabaseConfigured } from "@/lib/config";

/** Routes that require a session. Prefix match, so `/compte/profil` counts. */
const PROTECTED_PREFIXES = ["/compte", "/admin"];

/**
 * Sign-in screens, which must stay reachable without a session — guarding
 * `/admin/login` under the `/admin` prefix would loop it onto itself.
 */
const ADMIN_LOGIN = "/admin/login";

/** Auth pages a signed-in visitor has no reason to see. */
const GUEST_ONLY_PATHS = ["/auth/login", "/auth/register"];

/**
 * Espaces réservés à un rôle.
 *
 * Jusqu'ici le middleware ne vérifiait que l'existence d'une session : un
 * client pouvait ouvrir `/compte/courses`, l'espace chauffeur, et un chauffeur
 * l'historique client. Les composants s'en tiraient par une redirection côté
 * navigateur — c'est-à-dire par rien du tout, puisqu'elle s'exécute après que
 * la page a été servie.
 *
 * Chacun est renvoyé chez lui plutôt que vers une erreur : se tromper d'onglet
 * n'est pas une faute, et un 403 sur son propre compte serait déroutant.
 */
const DRIVER_ONLY = ["/compte/courses"];
const CLIENT_ONLY = ["/compte/reservations", "/compte/reservation"];

/** Accueil de chaque rôle, où le renvoyer quand il se trompe d'espace. */
const HOME_FOR = { driver: "/compte/courses", client: "/compte/reservations" };

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isProtected(pathname: string) {
  if (pathname === ADMIN_LOGIN) return false;
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/** The back-office has its own door: never send its visitors to the public one. */
function loginPathFor(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/")
    ? ADMIN_LOGIN
    : "/auth/login";
}

export async function middleware(request: NextRequest) {
  // Demo mode: the session lives in localStorage, which the server cannot see.
  // Guarding here would lock the no-keys demo out of its own account space, so
  // the client-side guard in AccountDashboard stays in charge (see CLAUDE.md §
  // Architecture principles, point 1).
  if (!isSupabaseConfigured) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options: CookieOptions;
        }[]
      ) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Refreshes the session if it has expired, and tells us who is calling.
  // getUser() revalidates the JWT with Supabase — a cookie the browser controls
  // is not evidence on its own.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  /**
   * Redirect while keeping the refreshed auth cookies: they were written onto
   * `response`, and a fresh NextResponse.redirect would drop them — logging the
   * visitor out exactly when their token was renewed.
   */
  const redirectTo = (path: string, next?: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    if (next) url.searchParams.set("next", next);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  // Come back to the requested page once signed in. The admin console always
  // lands on /admin, so it needs no `next`.
  if (!user && isProtected(pathname)) {
    const login = loginPathFor(pathname);
    return login === ADMIN_LOGIN
      ? redirectTo(login)
      : redirectTo(login, `${pathname}${search}`);
  }

  if (user && GUEST_ONLY_PATHS.includes(pathname)) return redirectTo("/compte");

  /**
   * Cloisonnement des espaces client / chauffeur.
   *
   * ⚠️ Le rôle est lu dans `profiles`, **jamais dans `user_metadata`** : un
   * utilisateur peut réécrire ses propres métadonnées avec
   * `supabase.auth.updateUser({ data: { role: "driver" } })`. La colonne, elle,
   * est verrouillée par le trigger `profiles_protect_privileged`.
   *
   * Coût assumé : une requête supplémentaire, et seulement sur les deux
   * espaces cloisonnés — pas sur `/compte` ni `/compte/profil`, communs aux
   * deux rôles.
   */
  if (user && (matches(pathname, DRIVER_ONLY) || matches(pathname, CLIENT_ONLY))) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = profile?.role === "driver" ? "driver" : "client";
    const wrongSpace =
      (role === "client" && matches(pathname, DRIVER_ONLY)) ||
      (role === "driver" && matches(pathname, CLIENT_ONLY));

    if (wrongSpace) return redirectTo(HOME_FOR[role]);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
