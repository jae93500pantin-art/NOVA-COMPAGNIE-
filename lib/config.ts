/**
 * Central runtime configuration & feature flags.
 *
 * The app degrades gracefully: when the relevant environment variables are
 * absent, features fall back to the bundled mock experience so the prototype
 * always runs without any external service.
 */

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "",
};

/**
 * Server-only secret. NEVER prefixed with NEXT_PUBLIC and never imported into
 * a Client Component — it must stay on the server (used for privileged admin
 * operations such as full account deletion).
 */
export const serverEnv = {
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "Nova Compagnie <onboarding@resend.dev>",
  /**
   * Google Places (autocomplétion d'adresses). **Server-only** : sans le
   * préfixe NEXT_PUBLIC, la clé ne part jamais dans le bundle — l'appel passe
   * par `/api/places`. Absente, Mapbox prend le relais ; absents tous les
   * deux, le champ reste en saisie libre.
   */
  googleMapsKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
};

export const isSupabaseConfigured =
  env.supabaseUrl.startsWith("http") && env.supabaseAnonKey.length > 20;

export const isMapboxConfigured = env.mapboxToken.startsWith("pk.");

export const isSupabaseAdminConfigured =
  isSupabaseConfigured && serverEnv.supabaseServiceRoleKey.length > 20;

/**
 * Transactional email (Resend) is configured when an API key is present.
 * Sans clé, les envois sont simplement ignorés (validation d'un chauffeur,
 * notamment) et le reste continue de fonctionner.
 */
export const isEmailConfigured = serverEnv.resendApiKey.startsWith("re_");
