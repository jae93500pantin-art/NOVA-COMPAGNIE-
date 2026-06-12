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
};

export const isSupabaseConfigured =
  env.supabaseUrl.startsWith("http") && env.supabaseAnonKey.length > 20;

export const isMapboxConfigured = env.mapboxToken.startsWith("pk.");

export const isSupabaseAdminConfigured =
  isSupabaseConfigured && serverEnv.supabaseServiceRoleKey.length > 20;
