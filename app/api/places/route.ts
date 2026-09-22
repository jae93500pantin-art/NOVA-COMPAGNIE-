import { NextRequest } from "next/server";
import { env, serverEnv, isMapboxConfigured } from "@/lib/config";
import {
  fromGoogle,
  fromMapbox,
  normalizeQuery,
  shouldQueryPlaces,
  PLACES_LIMIT,
  type PlaceSuggestion,
} from "@/lib/places";
import { rateLimit } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/places?q=… → suggestions d'adresses.
 *
 * Proxy volontaire : le navigateur ne parle jamais au fournisseur (voir
 * `lib/places.ts`). Google si `GOOGLE_MAPS_API_KEY` est présente, sinon Mapbox
 * — déjà configuré pour la carte, et déjà autorisé par la CSP.
 *
 * ⚠️ **Dégradation gracieuse** (principe n° 1 du dépôt) : sans aucune clé, la
 * route répond `{ suggestions: [] , configured: false }` au lieu d'échouer. Le
 * champ redevient alors une simple saisie libre — on peut toujours réserver,
 * on perd seulement l'assistance. Une adresse tapée à la main reste une
 * adresse valide.
 */
export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  // L'autocomplétion part à chaque mot saisi : la limite est haute, mais elle
  // existe — ces requêtes sont facturées à l'appel chez les deux fournisseurs.
  const rl = rateLimit(`places:${ip}`, 60, 60_000);
  if (!rl.ok) {
    return Response.json(
      { suggestions: [], error: "Trop de requêtes" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const q = normalizeQuery(req.nextUrl.searchParams.get("q"));
  if (!shouldQueryPlaces(q)) {
    return Response.json({ suggestions: [], configured: true });
  }

  const google = serverEnv.googleMapsKey;
  const provider = google ? "google" : isMapboxConfigured ? "mapbox" : null;
  if (!provider) {
    // Aucun fournisseur : le champ reste utilisable en saisie libre.
    return Response.json({ suggestions: [], configured: false });
  }

  try {
    const suggestions = await (provider === "google"
      ? queryGoogle(q, google)
      : queryMapbox(q, env.mapboxToken));

    return Response.json(
      { suggestions, configured: true },
      {
        // Les mêmes préfixes reviennent sans cesse ; 60 s de cache privé
        // évitent de refacturer chaque retour arrière dans le champ.
        headers: { "Cache-Control": "private, max-age=60" },
      }
    );
  } catch (err) {
    console.error(
      `[places] ${provider} injoignable : ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    // Le fournisseur est en panne : on ne bloque pas la réservation pour ça.
    return Response.json({ suggestions: [], configured: true });
  }
}

/** Abandonne au bout de 4 s : une suggestion tardive n'intéresse plus personne. */
async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function queryMapbox(q: string, token: string): Promise<PlaceSuggestion[]> {
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
    `?access_token=${encodeURIComponent(token)}` +
    `&autocomplete=true&language=fr&country=fr&limit=${PLACES_LIMIT}` +
    // Adresses ET points d'intérêt : « Gare de Lyon » est une destination de
    // course aussi légitime qu'un numéro de rue.
    `&types=address,poi,place`;
  return fromMapbox(await fetchJson(url));
}

async function queryGoogle(q: string, key: string): Promise<PlaceSuggestion[]> {
  const url =
    `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
    `?input=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}` +
    `&language=fr&components=country:fr`;
  return fromGoogle(await fetchJson(url));
}
