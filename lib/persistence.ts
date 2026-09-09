import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/config";
import type { Booking, BookingStatus } from "./bookings";
import type { ChatMessage } from "./chat";
import type { CertifiedReview } from "./reviews";
import {
  bookingToRow,
  messageToRow,
  reviewToRow,
  rowToBooking,
  rowToMessage,
  rowToReview,
  type BookingRow,
  type MessageRow,
  type ReviewRow,
} from "./dbRows";

/**
 * Persistance des réservations, messages et avis.
 *
 * ## Pourquoi le service role
 *
 * Les routes vérifient déjà l'identité (session) puis la légitimité
 * (`bookingActor`/`canActOn`, `canReviewBooking`) avant d'appeler ce module :
 * elles sont l'autorité. Elles écrivent donc avec le service role, comme le
 * back-office. Passer par un jeton utilisateur obligerait la RLS à rejouer des
 * règles qu'elle ne peut pas exprimer — un chauffeur y est identifié par un
 * slug d'annuaire en dur, pas par la ligne qu'il possède.
 *
 * ## Pourquoi ce n'est pas une base de données « branchée directement »
 *
 * Les brokers gardent la copie vive et le pub/sub SSE ; ce module n'ajoute que
 * la durabilité, en écriture immédiate et en relecture au premier accès. Le
 * temps réel ne traverse donc pas le process : un second serveur ne verrait
 * pas les événements du premier. C'est assumé — le déploiement est une VM, un
 * seul process — et le jour où il y en aura deux, c'est Supabase Realtime qui
 * remplacera le pub/sub, pas ce module.
 *
 * ## En cas d'échec
 *
 * Une écriture ratée est journalisée et ne fait pas échouer la requête : la
 * réservation vit encore en mémoire, et perdre la course d'un client parce que
 * la base a hoqueté serait pire que perdre sa durabilité. Le journal est le
 * seul endroit où cela se voit — d'où le `console.error`.
 */

export const isPersistenceEnabled = isSupabaseAdminConfigured;

const BOOKING_COLUMNS =
  "id, client_id, driver_slug, client_name, client_email, hours, unit, transfer, total, pickup, dropoff, when_local, status, created_at";
const MESSAGE_COLUMNS =
  "id, booking_id, sender_id, sender_role, sender_name, body, created_at";
const REVIEW_COLUMNS =
  "id, driver_slug, author_id, author_name, booking_id, rating, comment, trip, created_at";

function client() {
  return isPersistenceEnabled ? getSupabaseAdmin() : null;
}

function failed(what: string, error: unknown): null {
  console.error(
    `[persistence] ${what} : ${
      error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error)
    }`
  );
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Réservations                                                              */
/* -------------------------------------------------------------------------- */

/** Toutes les courses d'un chauffeur, de la plus ancienne à la plus récente. */
export async function loadDriverBookings(driverSlug: string): Promise<Booking[]> {
  const db = client();
  if (!db) return [];
  const { data, error } = await db
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("driver_slug", driverSlug)
    // L'ordre de la salle est chronologique : la copie mémoire empile à la fin.
    .order("created_at", { ascending: true });
  if (error) {
    failed(`lecture des courses de ${driverSlug}`, error);
    return [];
  }
  return (data as BookingRow[]).map(rowToBooking);
}

export async function loadBooking(bookingId: string): Promise<Booking | null> {
  const db = client();
  if (!db) return null;
  const { data, error } = await db
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("id", bookingId)
    .maybeSingle();
  if (error) return failed(`lecture de la course ${bookingId}`, error);
  return data ? rowToBooking(data as BookingRow) : null;
}

/**
 * Écrit une réservation et renvoie celle que la base a réellement enregistrée.
 *
 * L'identifiant vient de Postgres : deux générateurs concurrents finiraient
 * par produire une réservation dont l'id mémoire et l'id en base diffèrent, et
 * le chat comme les avis s'y rattachent par cet id.
 */
export async function insertBooking(booking: Booking): Promise<Booking | null> {
  const db = client();
  if (!db) return null;
  const { data, error } = await db
    .from("bookings")
    .insert(bookingToRow(booking))
    .select(BOOKING_COLUMNS)
    .single();
  if (error) return failed("écriture d'une course", error);
  return rowToBooking(data as BookingRow);
}

export async function persistBookingStatus(
  bookingId: string,
  status: BookingStatus
): Promise<void> {
  const db = client();
  if (!db) return;
  const { error } = await db
    .from("bookings")
    .update({ status })
    .eq("id", bookingId);
  if (error) failed(`passage de ${bookingId} en ${status}`, error);
}

/* -------------------------------------------------------------------------- */
/*  Messages                                                                  */
/* -------------------------------------------------------------------------- */

export async function loadMessages(
  bookingId: string,
  booking: Pick<Booking, "clientId" | "driverId">
): Promise<ChatMessage[]> {
  const db = client();
  if (!db) return [];
  const { data, error } = await db
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });
  if (error) {
    failed(`lecture du fil ${bookingId}`, error);
    return [];
  }
  return (data as MessageRow[]).map((row) => rowToMessage(row, booking));
}

export async function insertMessage(
  message: ChatMessage,
  authorAccountId: string,
  booking: Pick<Booking, "clientId" | "driverId">
): Promise<ChatMessage | null> {
  const db = client();
  if (!db) return null;
  const { data, error } = await db
    .from("messages")
    .insert(messageToRow(message, authorAccountId))
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) return failed("écriture d'un message", error);
  return rowToMessage(data as MessageRow, booking);
}

/* -------------------------------------------------------------------------- */
/*  Avis                                                                      */
/* -------------------------------------------------------------------------- */

export async function loadDriverReviews(
  driverSlug: string
): Promise<CertifiedReview[]> {
  const db = client();
  if (!db) return [];
  const { data, error } = await db
    .from("reviews")
    .select(REVIEW_COLUMNS)
    .eq("driver_slug", driverSlug)
    // Les avis s'affichent du plus récent au plus ancien.
    .order("created_at", { ascending: false });
  if (error) {
    failed(`lecture des avis de ${driverSlug}`, error);
    return [];
  }
  return (data as ReviewRow[]).map(rowToReview);
}

export async function insertReview(
  review: CertifiedReview
): Promise<CertifiedReview | null> {
  const db = client();
  if (!db) return null;
  const { data, error } = await db
    .from("reviews")
    .insert(reviewToRow(review))
    .select(REVIEW_COLUMNS)
    .single();
  // `reviews.booking_id` est unique : une course déjà notée remonte ici en
  // violation de contrainte. C'est la garantie « une course, un avis » tenue
  // par la base, et pas seulement par le code qui l'a vérifiée juste avant.
  if (error) return failed("écriture d'un avis", error);
  return rowToReview(data as ReviewRow);
}
