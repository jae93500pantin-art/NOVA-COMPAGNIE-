/**
 * Store des avis certifiés, côté serveur.
 *
 * Un seau par chauffeur, comme `bookingBroker`. Quand la persistance est
 * configurée, le seau est relu depuis `public.reviews` au premier accès puis
 * écrit au fil de l'eau ; sans clés de service, le comportement éphémère
 * d'origine est conservé.
 *
 * La durabilité compte davantage ici qu'ailleurs : un avis est le seul contenu
 * de la plateforme que son auteur ne peut pas reproduire — il faudrait
 * recommencer une course. Le perdre à un redémarrage revenait à effacer la
 * réputation des chauffeurs.
 */

import "server-only";
import { buildReview, type CertifiedReview, type NewReviewInput } from "./reviews";
import {
  insertReview,
  isPersistenceEnabled,
  loadDriverReviews,
} from "./persistence";

/** Newest first, capped so one driver cannot grow the process unbounded. */
const MAX_REVIEWS_PER_DRIVER = 200;

interface State {
  byDriver: Map<string, CertifiedReview[]>;
  hydrated: Set<string>;
  hydrating: Map<string, Promise<void>>;
}

const g = globalThis as unknown as { __reviewBroker?: State };
const state: State = g.__reviewBroker ?? {
  byDriver: new Map(),
  hydrated: new Set(),
  hydrating: new Map(),
};
if (!g.__reviewBroker) g.__reviewBroker = state;
// Un process plus ancien peut détenir un état créé avant ces deux champs.
if (!state.hydrated) state.hydrated = new Set();
if (!state.hydrating) state.hydrating = new Map();

async function ready(driverId: string): Promise<CertifiedReview[]> {
  if (!isPersistenceEnabled || state.hydrated.has(driverId)) {
    return state.byDriver.get(driverId) ?? [];
  }
  let pending = state.hydrating.get(driverId);
  if (!pending) {
    pending = (async () => {
      const stored = await loadDriverReviews(driverId);
      const local = state.byDriver.get(driverId) ?? [];
      const known = new Set(local.map((r) => r.id));
      // La base renvoie déjà du plus récent au plus ancien ; les avis publiés
      // par ce process sont plus récents encore, donc en tête.
      const merged = local.concat(stored.filter((r) => !known.has(r.id)));
      state.byDriver.set(driverId, merged.slice(0, MAX_REVIEWS_PER_DRIVER));
      state.hydrated.add(driverId);
    })().finally(() => {
      state.hydrating.delete(driverId);
    });
    state.hydrating.set(driverId, pending);
  }
  await pending;
  return state.byDriver.get(driverId) ?? [];
}

/** Published reviews for a driver, newest first. */
export async function listReviews(driverId: string): Promise<CertifiedReview[]> {
  return ready(driverId);
}

/** Whether this ride has already been reviewed. */
export async function hasReviewForBooking(
  driverId: string,
  bookingId: string
): Promise<boolean> {
  const list = await ready(driverId);
  return list.some((r) => r.bookingId === bookingId);
}

export async function addReview(
  input: NewReviewInput
): Promise<CertifiedReview> {
  const list = await ready(input.driverId);
  const draft = buildReview(input);
  const review = (await insertReview(draft)) ?? draft;
  list.unshift(review);
  state.byDriver.set(input.driverId, list.slice(0, MAX_REVIEWS_PER_DRIVER));
  return review;
}

/** Test helper — drops everything for one driver. */
export function dropReviews(driverId: string): void {
  state.byDriver.delete(driverId);
  state.hydrated.delete(driverId);
}
