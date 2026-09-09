import { NextRequest } from "next/server";
import {
  createBooking,
  updateBookingStatus,
  subscribeBookings,
  getBookingById,
  type BookingEvent,
} from "@/lib/bookingBroker";
import type { BookingStatus, Booking } from "@/lib/bookings";
import { formatWhen, bookingActor, canActOn } from "@/lib/bookings";
import { getServerUser } from "@/lib/session";
import { isValidRoom, sanitizeText, rateLimit } from "@/lib/validation";
import { getDriver } from "@/lib/drivers";
import type { Driver } from "@/lib/types";
import { computeAmount, type BookingUnit } from "@/lib/payments";
import {
  driverServesTransferDestination,
  getTransferDestination,
  isKnownTransferDestination,
  transferDestinationLabel,
  transferFareForDriver,
} from "@/lib/transfer";
import { clampRate } from "@/lib/pricing";
import {
  sendEmail,
  bookingRequestEmail,
  bookingConfirmedEmail,
  paymentReceivedEmail,
} from "@/lib/email";

/** What the client booked, in one line: a duration, or the transfer itself. */
function durationText(booking: Booking): string {
  if (booking.unit === "transfer") {
    const dest = getTransferDestination(booking.transfer);
    return dest
      ? `Transfert aéroport · ${transferDestinationLabel(dest)}`
      : "Transfert aéroport";
  }
  return `${booking.hours} ${booking.unit === "day" ? "jour(s)" : "h"}`;
}

function emailData(driver: Driver, booking: Booking) {
  return {
    clientName: booking.clientName,
    driverName: `${driver.firstName} ${driver.lastName}`,
    vehicle: `${driver.car.make} ${driver.car.model}`,
    whenText: formatWhen(booking.when, "fr"),
    durationText: durationText(booking),
    total: booking.total,
  };
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Real-time course bookings between a client and a driver.
 *  GET   → SSE stream (snapshot + booking/status events) for a driver.
 *  POST  → client creates a booking request (amount recomputed server-side).
 *  PATCH → driver accepts/refuses a booking.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: { driverId: string } }
) {
  const driverId = params.driverId;
  if (!isValidRoom(driverId) || !getDriver(driverId)) {
    return new Response("Invalid driver", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (e: BookingEvent | { type: "ping" }) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const unsub = subscribeBookings(driverId, send);
      const heartbeat = setInterval(() => send({ type: "ping" }), 15000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsub();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { driverId: string } }
) {
  const driverId = params.driverId;
  const driver = getDriver(driverId);
  if (!isValidRoom(driverId) || !driver) {
    return Response.json({ error: "Invalid driver" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (!rateLimit(`booking:${ip}`, 15, 60_000).ok) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // L'identité vient de la session, jamais du corps de la requête : sinon
  // n'importe qui peut réserver au nom d'un autre, et surtout se déclarer
  // propriétaire d'une réservation qui ne lui appartient pas.
  // Mode démo (aucune clé Supabase) : le serveur ne voit aucune session, on
  // retombe sur l'id de navigateur comme avant pour ne pas casser la démo.
  const session = await getServerUser();
  if (session.state === "anonymous") {
    return Response.json({ error: "Authentification requise" }, { status: 401 });
  }
  const clientId =
    session.state === "ok" ? session.user.id : sanitizeText(body.clientId, 64);
  if (!clientId) {
    return Response.json({ error: "Missing client id" }, { status: 400 });
  }

  // Amount is recomputed server-side from the trusted driver price.
  const unit: BookingUnit =
    body.unit === "day" || body.unit === "transfer" ? body.unit : "hour";

  // A transfer is only bookable on a destination this driver actually serves,
  // and its flat fare comes from the driver's own vehicle class.
  let transfer: string | undefined;
  if (unit === "transfer") {
    transfer = sanitizeText(body.transfer, 32);
    // `driverServesTransferDestination` is permissive on an unknown id (it means
    // "no filter"), so the id must be checked explicitly first.
    if (
      !isKnownTransferDestination(transfer) ||
      !driverServesTransferDestination(driver, transfer)
    ) {
      return Response.json({ error: "Unsupported destination" }, { status: 400 });
    }
  }

  let amount;
  try {
    // Rates are driver-set, so they are re-clamped to the band of their class
    // before anything is billed — never trusted as stored.
    const category = driver.categories[0];
    amount = computeAmount(
      clampRate(category, "hour", driver.pricePerHour),
      clampRate(category, "day", driver.pricePerDay),
      unit,
      Number(body.hours ?? 1),
      transferFareForDriver(driver)
    );
  } catch {
    return Response.json({ error: "Invalid amount" }, { status: 400 });
  }

  const booking = createBooking({
    driverId,
    clientId,
    // Nom et e-mail viennent aussi de la session quand elle existe : les
    // laisser au client permettrait d'usurper une identité dans les e-mails
    // de confirmation.
    clientName:
      session.state === "ok"
        ? `${session.user.firstName} ${session.user.lastName}`.trim() || "Client"
        : sanitizeText(body.clientName, 60) || "Client",
    clientEmail:
      session.state === "ok"
        ? session.user.email ?? ""
        : sanitizeText(body.clientEmail, 120),
    hours: amount.hours,
    unit,
    transfer,
    total: amount.total,
    pickup: sanitizeText(body.pickup, 120),
    dropoff: sanitizeText(body.dropoff, 120),
    when: sanitizeText(body.when, 60),
  });

  // Confirmation e-mail (no-op when RESEND_API_KEY is absent).
  if (booking.clientEmail) {
    const { subject, html } = bookingRequestEmail(emailData(driver, booking));
    void sendEmail({ to: booking.clientEmail, subject, html });
  }

  return Response.json({ ok: true, booking });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { driverId: string } }
) {
  const driverId = params.driverId;
  if (!isValidRoom(driverId) || !getDriver(driverId)) {
    return Response.json({ error: "Invalid driver" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const bookingId = sanitizeText(body.bookingId, 64);
  const status = body.status as BookingStatus;
  const allowed: BookingStatus[] = [
    "confirmed",
    "refused",
    "paid",
    "completed",
    "cancelled",
  ];
  if (!allowed.includes(status)) {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }

  /**
   * Autorisation.
   *
   * `canTransition` (dans le broker) dit si le changement est cohérent ;
   * il ne dit pas s'il est légitime. Un chauffeur acceptant sa propre course,
   * ou un client marquant « payée » sans payer, sont des transitions
   * parfaitement valides pour la machine à états. Sans ce contrôle, un simple
   * id de réservation suffisait à faire n'importe quoi sur la course d'autrui.
   *
   * Mode démo : aucune session côté serveur, on conserve le comportement
   * historique plutôt que de bloquer la démonstration.
   */
  const session = await getServerUser();
  if (session.state !== "unconfigured") {
    if (session.state === "anonymous") {
      return Response.json({ error: "Authentification requise" }, { status: 401 });
    }
    const target = getBookingById(bookingId);
    if (!target || target.driverId !== driverId) {
      return Response.json({ error: "Cannot update" }, { status: 409 });
    }
    const actor = bookingActor(
      target,
      session.user.id,
      session.user.driverSlug
    );
    if (!canActOn(actor, status)) {
      // Même réponse qu'un inconnu et qu'une partie qui outrepasse son rôle :
      // distinguer les deux révélerait l'existence de la réservation.
      return Response.json({ error: "Action non autorisée" }, { status: 403 });
    }
  }

  const updated = updateBookingStatus(driverId, bookingId, status);
  if (!updated) {
    return Response.json({ error: "Cannot update" }, { status: 409 });
  }

  // Status-change confirmation e-mail (no-op when email isn't configured).
  const driver = getDriver(driverId);
  if (driver && updated.clientEmail) {
    const data = emailData(driver, updated);
    if (status === "confirmed") {
      const { subject, html } = bookingConfirmedEmail(data);
      void sendEmail({ to: updated.clientEmail, subject, html });
    } else if (status === "paid") {
      const { subject, html } = paymentReceivedEmail(data);
      void sendEmail({ to: updated.clientEmail, subject, html });
    }
  }

  return Response.json({ ok: true, booking: updated });
}
