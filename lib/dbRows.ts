/**
 * Traduction entre les lignes Postgres et les types du domaine.
 *
 * Volontairement **pur** et séparé des accès réseau (`lib/persistence.ts`) :
 * c'est ici que se cachent les pièges d'une couche de persistance, et ils se
 * testent sans base.
 *
 *  - `numeric` revient de PostgREST en **chaîne**, jamais en nombre : un
 *    `total` recopié tel quel donnerait `"120.00" € ` à l'affichage et
 *    casserait toute comparaison.
 *  - L'heure de prise en charge est saisie en heure locale sans fuseau. Elle
 *    est conservée telle quelle (`when_local`) ; `start_at` n'est qu'une
 *    projection pour le tri, et ne revient jamais dans le domaine.
 *  - Le chauffeur est désigné par son slug (`lib/drivers.ts`), l'annuaire
 *    n'étant pas encore en base.
 *  - Une valeur d'enum inconnue (base plus récente que le code) est ramenée à
 *    un défaut sûr plutôt que de faire circuler un statut que rien ne sait
 *    traiter.
 */

import type { Booking, BookingStatus } from "./bookings";
import type { BookingUnit } from "./payments";
import { bookingStartsAt } from "./bookings";
import type { ChatMessage, ChatRole } from "./chat";
import type { CertifiedReview } from "./reviews";

/* -------------------------------------------------------------------------- */
/*  Réservations                                                              */
/* -------------------------------------------------------------------------- */

export interface BookingRow {
  id: string;
  client_id: string;
  driver_slug: string | null;
  client_name: string | null;
  client_email: string | null;
  hours: number | string | null;
  unit: string | null;
  transfer: string | null;
  total: number | string | null;
  pickup: string | null;
  dropoff: string | null;
  when_local: string | null;
  status: string | null;
  created_at: string;
}

const UNITS: BookingUnit[] = ["hour", "day", "transfer"];
const STATUSES: BookingStatus[] = [
  "pending",
  "confirmed",
  "refused",
  "paid",
  "completed",
  "cancelled",
];

export function rowToBooking(row: BookingRow): Booking {
  return {
    id: String(row.id),
    driverId: row.driver_slug ?? "",
    clientId: row.client_id,
    clientName: row.client_name || "Client",
    clientEmail: row.client_email || "",
    hours: numberOr(row.hours, 1),
    unit: UNITS.includes(row.unit as BookingUnit)
      ? (row.unit as BookingUnit)
      : "hour",
    transfer: row.transfer ?? undefined,
    total: numberOr(row.total, 0),
    pickup: row.pickup || "",
    dropoff: row.dropoff || "",
    when: row.when_local || "",
    status: STATUSES.includes(row.status as BookingStatus)
      ? (row.status as BookingStatus)
      : "pending",
    createdAt: timestampOr(row.created_at, 0),
  };
}

/**
 * Charge d'insertion. Ni `id` ni `created_at` : Postgres les produit, ce qui
 * évite deux générateurs d'identifiants concurrents.
 */
export function bookingToRow(booking: Booking) {
  const startsAt = bookingStartsAt(booking);
  return {
    client_id: booking.clientId,
    driver_slug: booking.driverId,
    client_name: booking.clientName,
    client_email: booking.clientEmail,
    hours: booking.hours,
    unit: booking.unit,
    transfer: booking.transfer ?? null,
    total: booking.total,
    pickup: booking.pickup,
    dropoff: booking.dropoff,
    when_local: booking.when,
    // Projection pour le tri uniquement : `when_local` reste la référence.
    start_at: Number.isFinite(startsAt)
      ? new Date(startsAt).toISOString()
      : null,
    status: booking.status,
  };
}

/* -------------------------------------------------------------------------- */
/*  Messages                                                                  */
/* -------------------------------------------------------------------------- */

export interface MessageRow {
  id: string;
  booking_id: string;
  sender_id: string;
  sender_role: string | null;
  sender_name: string | null;
  body: string;
  created_at: string;
}

/**
 * L'id d'expéditeur exposé à l'interface est celui de la RÉSERVATION, pas le
 * compte : `BookingChat` compare `message.senderId` à `booking.clientId` /
 * `booking.driverId` pour savoir quelles bulles sont les siennes. La colonne
 * `sender_id` garde le compte auteur, qui seul survit à un changement de slug.
 */
export function rowToMessage(
  row: MessageRow,
  booking: Pick<Booking, "clientId" | "driverId">
): ChatMessage {
  const role: ChatRole = row.sender_role === "driver" ? "driver" : "client";
  return {
    id: String(row.id),
    bookingId: String(row.booking_id),
    role,
    senderId: role === "client" ? booking.clientId : booking.driverId,
    senderName: row.sender_name || "",
    text: row.body,
    createdAt: timestampOr(row.created_at, 0),
  };
}

export function messageToRow(message: ChatMessage, authorAccountId: string) {
  return {
    booking_id: message.bookingId,
    sender_id: authorAccountId,
    sender_role: message.role,
    sender_name: message.senderName,
    body: message.text,
  };
}

/* -------------------------------------------------------------------------- */
/*  Avis                                                                      */
/* -------------------------------------------------------------------------- */

export interface ReviewRow {
  id: string;
  driver_slug: string | null;
  author_id: string | null;
  author_name: string | null;
  booking_id: string | null;
  rating: number | string | null;
  comment: string;
  trip: string | null;
  created_at: string;
}

export function rowToReview(row: ReviewRow): CertifiedReview {
  return {
    id: String(row.id),
    bookingId: row.booking_id ? String(row.booking_id) : "",
    driverId: row.driver_slug ?? "",
    // L'auteur n'est plus exposé : la ligne prouve seulement qu'un avis existe.
    clientId: row.author_id ?? "",
    author: row.author_name || "Client",
    rating: numberOr(row.rating, 5),
    comment: row.comment,
    trip: row.trip || "",
    createdAt: timestampOr(row.created_at, 0),
  };
}

export function reviewToRow(review: CertifiedReview) {
  return {
    driver_slug: review.driverId,
    author_id: review.clientId || null,
    author_name: review.author,
    booking_id: review.bookingId || null,
    rating: review.rating,
    comment: review.comment,
    trip: review.trip || null,
  };
}

/* -------------------------------------------------------------------------- */

/**
 * `numeric` arrive en chaîne ; une valeur illisible ne doit pas donner NaN.
 *
 * ⚠️ `Number("")` vaut 0, pas NaN : une colonne vide passerait donc pour un
 * zéro parfaitement valide — une course de zéro heure, un total de zéro euro.
 * Une chaîne vide est une valeur ABSENTE, elle doit tomber sur le défaut.
 */
function numberOr(raw: number | string | null | undefined, fallback: number) {
  if (typeof raw === "string" && raw.trim() === "") return fallback;
  const n = typeof raw === "string" ? Number(raw) : raw;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function timestampOr(raw: string | null | undefined, fallback: number) {
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(t) ? fallback : t;
}
