/**
 * Certified reviews: a review exists only because a ride happened.
 *
 * The rule that makes them worth anything is here and nowhere else — a review
 * requires a booking that is **completed**, that belongs to the author, and
 * that has not already been reviewed. One ride, one voice.
 *
 * Pure and unit-tested: the API route and the UI both call these helpers, so
 * the client-side form can never be more permissive than the server.
 */

import { DEFAULT_DROPOFF, DEFAULT_PICKUP, type Booking } from "./bookings";
import { getTransferDestination, transferDestinationLabel } from "./transfer";

export const REVIEW_MIN_COMMENT = 10;
export const REVIEW_MAX_COMMENT = 500;
export const REVIEW_MIN_RATING = 1;
export const REVIEW_MAX_RATING = 5;

export interface CertifiedReview {
  id: string;
  /** The ride this review is attached to — the proof it is genuine. */
  bookingId: string;
  driverId: string;
  /** Author identity, kept to enforce one review per ride. */
  clientId: string;
  /** Public display name, already masked ("Sophie L."). */
  author: string;
  rating: number;
  comment: string;
  /** Certified trip, derived from the booking — never typed by the author. */
  trip: string;
  createdAt: number;
}

export interface NewReviewInput {
  bookingId: string;
  driverId: string;
  clientId: string;
  clientName: string;
  rating: number;
  comment: string;
  trip?: string;
}

/* -------------------------------------------------------------------------- */
/*  Authorisation                                                             */
/* -------------------------------------------------------------------------- */

export type ReviewRefusal =
  | "not-found"
  | "not-yours"
  | "not-completed"
  | "already-reviewed";

/**
 * Whether this client may review this booking. `existing` is the list of
 * reviews already published (any ride), so a second review is refused.
 */
export function canReviewBooking(
  booking: Booking | undefined,
  clientId: string,
  existing: Pick<CertifiedReview, "bookingId">[] = []
): { ok: boolean; reason?: ReviewRefusal } {
  if (!booking) return { ok: false, reason: "not-found" };
  if (!clientId || booking.clientId !== clientId) {
    return { ok: false, reason: "not-yours" };
  }
  if (booking.status !== "completed") {
    return { ok: false, reason: "not-completed" };
  }
  if (existing.some((r) => r.bookingId === booking.id)) {
    return { ok: false, reason: "already-reviewed" };
  }
  return { ok: true };
}

/** French message for a refusal, for the API and the form. */
export function refusalMessage(reason: ReviewRefusal): string {
  switch (reason) {
    case "not-found":
      return "Réservation introuvable.";
    case "not-yours":
      return "Cette réservation n'est pas la vôtre.";
    case "not-completed":
      return "Vous pourrez laisser un avis une fois la course terminée.";
    case "already-reviewed":
      return "Vous avez déjà laissé un avis pour cette course.";
  }
}

/* -------------------------------------------------------------------------- */
/*  Validation                                                                */
/* -------------------------------------------------------------------------- */

/** null when the submission is valid, else a French message. */
export function reviewError(rating: number, comment: string): string | null {
  if (
    !Number.isInteger(rating) ||
    rating < REVIEW_MIN_RATING ||
    rating > REVIEW_MAX_RATING
  ) {
    return "Choisissez une note de 1 à 5 étoiles.";
  }
  const text = comment.trim();
  if (text.length < REVIEW_MIN_COMMENT) {
    return `Votre commentaire doit faire au moins ${REVIEW_MIN_COMMENT} caractères.`;
  }
  if (text.length > REVIEW_MAX_COMMENT) {
    return `Votre commentaire ne peut pas dépasser ${REVIEW_MAX_COMMENT} caractères.`;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Building                                                                  */
/* -------------------------------------------------------------------------- */

/** "Sophie Legrand" → "Sophie L." — full surnames never go public. */
export function maskAuthorName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Client";
  const [first, ...rest] = parts;
  const last = rest[rest.length - 1];
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
}

/**
 * Certified trip label taken from the booking itself: an airport transfer
 * names its route, anything else falls back to pickup → dropoff.
 */
export function tripLabelFromBooking(booking: Booking): string {
  if (booking.unit === "transfer") {
    const dest = getTransferDestination(booking.transfer);
    if (dest) return transferDestinationLabel(dest);
  }
  const from = booking.pickup?.trim();
  const to = booking.dropoff?.trim();
  // The placeholders are not addresses. Publishing "Adresse de départ →
  // Destination" as a *certified* trip would be worse than showing nothing.
  if (!from || !to || from === DEFAULT_PICKUP || to === DEFAULT_DROPOFF) {
    return "";
  }
  return `${from} → ${to}`;
}

export function buildReview(
  input: NewReviewInput,
  idFactory: () => string = defaultId,
  now: () => number = Date.now
): CertifiedReview {
  return {
    id: idFactory(),
    bookingId: input.bookingId,
    driverId: input.driverId,
    clientId: input.clientId,
    author: maskAuthorName(input.clientName || "Client"),
    rating: Math.round(input.rating),
    comment: input.comment.trim().slice(0, REVIEW_MAX_COMMENT),
    trip: (input.trip ?? "").trim(),
    createdAt: now(),
  };
}

function defaultId(): string {
  return `rv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/* -------------------------------------------------------------------------- */
/*  Aggregation                                                               */
/* -------------------------------------------------------------------------- */

export interface RatingSummary {
  /** Weighted average, 2 decimals. */
  average: number;
  /** Total reviews behind the average. */
  count: number;
  /** Share of each star level, 5 → 1, over the reviews actually listed. */
  distribution: { stars: number; count: number; pct: number }[];
}

/**
 * Aggregate a driver's rating.
 *
 * `baseline` carries the history the platform already displays (rating +
 * count on the driver record). It is folded into the average by weight so a
 * single new review cannot swing a 200-ride reputation — but the distribution
 * bars are computed from the listed reviews **only**, because inventing a
 * distribution for reviews we do not hold would be making numbers up.
 */
export function ratingSummary(
  reviews: Pick<CertifiedReview, "rating">[],
  baseline?: { average: number; count: number }
): RatingSummary {
  const listed = reviews.filter(
    (r) => r.rating >= REVIEW_MIN_RATING && r.rating <= REVIEW_MAX_RATING
  );
  const sum = listed.reduce((n, r) => n + r.rating, 0);

  const baseCount = Math.max(0, Math.round(baseline?.count ?? 0));
  const baseSum = baseCount * (baseline?.average ?? 0);
  const count = baseCount + listed.length;
  const average = count > 0 ? Math.round(((baseSum + sum) / count) * 100) / 100 : 0;

  const distribution = [5, 4, 3, 2, 1].map((stars) => {
    const n = listed.filter((r) => Math.round(r.rating) === stars).length;
    return {
      stars,
      count: n,
      pct: listed.length > 0 ? Math.round((n / listed.length) * 100) : 0,
    };
  });

  return { average, count, distribution };
}

/* -------------------------------------------------------------------------- */
/*  Display                                                                   */
/* -------------------------------------------------------------------------- */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "Il y a 3 jours" / "3 days ago". */
export function formatReviewAge(
  createdAt: number,
  now: number = Date.now(),
  lang: "fr" | "en" = "fr"
): string {
  const diff = Math.max(0, now - createdAt);
  const fr = lang === "fr";
  if (diff < HOUR) {
    const m = Math.max(1, Math.floor(diff / MINUTE));
    if (fr) return m === 1 ? "Il y a 1 minute" : `Il y a ${m} minutes`;
    return m === 1 ? "1 minute ago" : `${m} minutes ago`;
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    if (fr) return h === 1 ? "Il y a 1 heure" : `Il y a ${h} heures`;
    return h === 1 ? "1 hour ago" : `${h} hours ago`;
  }
  const d = Math.floor(diff / DAY);
  if (d < 30) {
    if (fr) return d === 1 ? "Hier" : `Il y a ${d} jours`;
    return d === 1 ? "Yesterday" : `${d} days ago`;
  }
  const months = Math.floor(d / 30);
  if (months < 12) {
    if (fr) return months === 1 ? "Il y a 1 mois" : `Il y a ${months} mois`;
    return months === 1 ? "1 month ago" : `${months} months ago`;
  }
  const years = Math.floor(months / 12);
  if (fr) return years === 1 ? "Il y a 1 an" : `Il y a ${years} ans`;
  return years === 1 ? "1 year ago" : `${years} years ago`;
}
