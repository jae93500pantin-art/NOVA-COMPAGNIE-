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
import { isValidRoom, sanitizeText, rateLimit } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Certified reviews for a driver.
 *  GET  → published reviews (public).
 *  POST → publish one, only for a completed booking of the author's own.
 *
 * ⚠️ Demo-mode limitation, identical to the bookings and chat APIs: the author
 * is taken from the request body (localStorage client id). With Supabase
 * configured, derive it from the session cookie instead — the ownership check
 * below is only as strong as that identity.
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

  const clientId = sanitizeText(body.clientId, 64);
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
    clientName: sanitizeText(body.clientName, 60) || booking!.clientName,
    rating,
    comment,
    // Never trusted from the client: the trip comes from the booking.
    trip: tripLabelFromBooking(booking!),
  });

  return Response.json({ ok: true, review });
}
