/**
 * Central runtime configuration & feature flags.
 *
 * The app degrades gracefully: when the relevant environment variables are
 * absent, features fall back to the bundled mock experience so the prototype
 * always runs without any external service.
 */

import { isSettlementAllowed } from "./payments";

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
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
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
 * Stripe is configured when a secret key is present. `sk_test_…` runs in test
 * mode (no real charges), `sk_live_…` in production. Without a key, the
 * booking flow falls back to the simulated confirmation.
 */
export const isStripeConfigured =
  serverEnv.stripeSecretKey.startsWith("sk_");

export const isStripeLiveMode =
  serverEnv.stripeSecretKey.startsWith("sk_live_");

/**
 * Transactional email (Resend) is configured when an API key is present.
 * Without it, booking emails are skipped (graceful no-op) and the flow still
 * works end-to-end in demo mode.
 */
export const isEmailConfigured = serverEnv.resendApiKey.startsWith("re_");

/**
 * Une course peut-elle être réglée sur cette instance ?
 *
 * Applique `isSettlementAllowed` aux drapeaux réels, en **un seul endroit** :
 * trois pages ont besoin de la réponse pour désactiver leurs boutons, et trois
 * recopies de la même condition finiraient par ne plus dire la même chose —
 * celle qui se tromperait n'afficherait aucune erreur, elle rouvrirait
 * simplement le règlement gratuit.
 *
 * ⚠️ À lire **côté serveur uniquement** : `isStripeConfigured` dépend d'une
 * variable sans `NEXT_PUBLIC`, donc un composant client la verrait toujours
 * fausse et bloquerait le paiement sans raison. Les pages la descendent en
 * prop.
 */
export const isSettlementOperative = isSettlementAllowed({
  stripeConfigured: isStripeConfigured,
  realAccounts: isSupabaseConfigured,
});
