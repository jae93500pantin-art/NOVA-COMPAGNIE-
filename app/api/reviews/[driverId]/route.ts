import { NextRequest } from "next/server";
import { getDriver } from "@/lib/drivers";
import { getBookingById } from "@/lib/bookingBroker";
import {
  addReview,
  hasReviewForBooking,
  listReviews,
} from "@/lib/reviewBroker";
import {
  canReviewBooking,
  refusalMessage,
  reviewError,
  tripLabelFromBooking,
} from "@/lib/reviews";
import { getServerUser } from "@/lib/session";
import { isValidRoom, sanitizeText, rateLimit } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Certified reviews for a driver.
 *  GET  → published reviews (public).
 *  POST → publish one, only for a completed booking of the author's own.
 *
 * « Certifié » veut dire une chose précise : seule une personne qui a
 * réellement commandé CE chauffeur, et dont la course est terminée, peut
 * publier. L'auteur vient donc de la **session** (`getServerUser`) et non du
 * corps de la requête — sinon il suffisait d'annoncer l'id d'un client pour
 * signer un avis à sa place, et le mot « certifié » ne garantissait rien.
 *
 * ⚠️ Mode démo (aucune clé Supabase) : le serveur ne voit aucune session, on
 * retombe sur l'id de navigateur comme avant. Le chemin de production est déjà
 * en base : `reviews.booking_id` est unique et la RLS revérifie la règle de la
 * course terminée (supabase/schema.sql).
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { driverId: string } }
) {
  const { driverId } = params;
  if (!isValidRoom(driverId) || !getDriver(driverId)) {
    return Response.json({ error: "Invalid driver" }, { status: 400 });
  }
  return Response.json({ reviews: listReviews(driverId) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { driverId: string } }
) {
  const { driverId } = params;
  const driver = getDriver(driverId);
  if (!isValidRoom(driverId) || !driver) {
    return Response.json({ error: "Invalid driver" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (!rateLimit(`review:${ip}`, 5, 60_000).ok) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const session = await getServerUser();
  if (session.state === "anonymous") {
    return Response.json({ error: "Authentification requise" }, { status: 401 });
  }
  const clientId =
    session.state === "ok" ? session.user.id : sanitizeText(body.clientId, 64);

  const bookingId = sanitizeText(body.bookingId, 64);
  const comment = sanitizeText(body.comment, 500);
  const rating = Number(body.rating);

  // Shape first: a malformed note never reaches the authorisation check.
  const invalid = reviewError(rating, comment);
  if (invalid) {
    return Response.json({ error: invalid }, { status: 400 });
  }

  // Then the rule that certifies the review: a completed ride, theirs, unreviewed.
  const booking = getBookingById(bookingId);
  const existing = hasReviewForBooking(driverId, bookingId)
    ? [{ bookingId }]
    : [];
  const verdict = canReviewBooking(
    booking && booking.driverId === driverId ? booking : undefined,
    clientId,
    existing
  );
  if (!verdict.ok) {
    const reason = verdict.reason ?? "not-found";
    return Response.json(
      { error: refusalMessage(reason), reason },
      // 403 when the ride exists but does not entitle them, 404 when it doesn't.
      { status: reason === "not-found" ? 404 : 403 }
    );
  }

  const review = addReview({
    bookingId,
    driverId,
    clientId,
    // La signature suit l'auteur : un avis certifié porte le nom du compte qui
    // a commandé la course, pas celui que le formulaire veut bien annoncer.
    clientName:
      session.state === "ok"
        ? `${session.user.firstName} ${session.user.lastName}`.trim() ||
          booking!.clientName
        : sanitizeText(body.clientName, 60) || booking!.clientName,
    rating,
    comment,
    // Never trusted from the client: the trip comes from the booking.
    trip: tripLabelFromBooking(booking!),
  });

  return Response.json({ ok: true, review });
}
