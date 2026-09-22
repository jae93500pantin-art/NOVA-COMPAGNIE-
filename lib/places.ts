/**
 * Autocomplétion d'adresses : types et règles, sans dépendance réseau.
 *
 * Module **pur** — la même logique décide côté navigateur quand interroger et
 * côté serveur ce qu'on accepte d'interroger.
 *
 * ## Pourquoi un proxy serveur plutôt qu'un appel direct au fournisseur
 *
 * Le navigateur n'appelle jamais Google ni Mapbox : il appelle
 * `/api/places`. Trois raisons, dans l'ordre d'importance :
 *
 * 1. **La CSP.** `next.config.js` liste les hôtes autorisés ; ajouter
 *    `maps.googleapis.com` à `connect-src` élargirait la surface pour toutes
 *    les pages. En passant par `'self'`, il n'y a rien à ouvrir.
 * 2. **La clé.** Une clé d'autocomplétion appelée depuis le navigateur est
 *    publique et facturée à l'usage : on la lit côté serveur.
 * 3. **Le fournisseur devient interchangeable.** Mapbox est déjà configuré
 *    dans ce dépôt (carte live) ; Google prend le relais si sa clé est
 *    présente. Le composant, lui, ne sait pas lequel répond.
 */

/** Une suggestion d'adresse, dans la forme que l'interface consomme. */
export interface PlaceSuggestion {
  /** Identifiant du fournisseur — sert de clé React, jamais de donnée métier. */
  id: string;
  /** Ligne principale : « 12 rue de Rivoli ». */
  label: string;
  /** Complément : « 75001 Paris, France ». */
  context: string;
  /** L'adresse complète, telle qu'elle sera enregistrée sur la réservation. */
  full: string;
  lng?: number;
  lat?: number;
}

/**
 * En-dessous, l'autocomplétion renvoie le quart de la ville et coûte une
 * requête pour rien.
 */
export const MIN_PLACES_QUERY = 3;

/** Frappe moyenne ≈ 150 ms/caractère : 250 ms attend un mot, pas une lettre. */
export const PLACES_DEBOUNCE_MS = 250;

/** Nombre de suggestions affichées. Au-delà, la liste ne se lit plus. */
export const PLACES_LIMIT = 5;

/** Faut-il interroger le fournisseur pour cette saisie ? */
export function shouldQueryPlaces(raw: string): boolean {
  return normalizeQuery(raw).length >= MIN_PLACES_QUERY;
}

/** Espaces superflus retirés — la même normalisation des deux côtés. */
export function normalizeQuery(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
}

/**
 * Découpe une adresse complète en ligne principale + contexte.
 *
 * Les deux fournisseurs renvoient « 12 rue de Rivoli, 75001 Paris, France » :
 * le premier segment est l'adresse, le reste la situe. Afficher la chaîne
 * entière sur une seule ligne la tronque au milieu du code postal.
 */
export function splitPlaceLabel(full: string): {
  label: string;
  context: string;
} {
  const parts = full.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { label: "", context: "" };
  return { label: parts[0], context: parts.slice(1).join(", ") };
}

/* -------------------------------------------------------------------------- */
/*  Normalisation des réponses fournisseur                                    */
/* -------------------------------------------------------------------------- */

/** Réponse Mapbox Geocoding v5 → suggestions. */
export function fromMapbox(payload: unknown): PlaceSuggestion[] {
  const features = (payload as { features?: unknown[] })?.features;
  if (!Array.isArray(features)) return [];

  return features.slice(0, PLACES_LIMIT).flatMap((raw) => {
    const f = raw as {
      id?: unknown;
      place_name?: unknown;
      center?: unknown;
    };
    const full = typeof f.place_name === "string" ? f.place_name : "";
    if (!full) return [];
    const center = Array.isArray(f.center) ? f.center : [];
    return [
      {
        id: String(f.id ?? full),
        ...splitPlaceLabel(full),
        full,
        lng: typeof center[0] === "number" ? center[0] : undefined,
        lat: typeof center[1] === "number" ? center[1] : undefined,
      },
    ];
  });
}

/**
 * Réponse Google Places Autocomplete → suggestions.
 *
 * ⚠️ Google ne renvoie **pas** de coordonnées dans l'autocomplétion : il faut
 * un second appel (Place Details) facturé séparément. On laisse donc `lng`/`lat`
 * indéfinis plutôt que d'inventer un point — l'adresse texte suffit au bon de
 * réservation, qui est le seul usage aujourd'hui.
 */
export function fromGoogle(payload: unknown): PlaceSuggestion[] {
  const predictions = (payload as { predictions?: unknown[] })?.predictions;
  if (!Array.isArray(predictions)) return [];

  return predictions.slice(0, PLACES_LIMIT).flatMap((raw) => {
    const p = raw as {
      place_id?: unknown;
      description?: unknown;
      structured_formatting?: { main_text?: unknown; secondary_text?: unknown };
    };
    const full = typeof p.description === "string" ? p.description : "";
    if (!full) return [];
    const main = p.structured_formatting?.main_text;
    const secondary = p.structured_formatting?.secondary_text;
    // Google donne déjà le découpage ; on ne refait le nôtre qu'à défaut.
    const split =
      typeof main === "string" && main
        ? { label: main, context: typeof secondary === "string" ? secondary : "" }
        : splitPlaceLabel(full);
    return [{ id: String(p.place_id ?? full), ...split, full }];
  });
}
