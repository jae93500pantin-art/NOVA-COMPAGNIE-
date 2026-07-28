import { NextRequest } from "next/server";
import {
  createBooking,
  updateBookingStatus,
  subscribeBookings,
  type BookingEvent,
} from "@/lib/bookingBroker";
import type { BookingStatus, Booking } from "@/lib/bookings";
import { formatWhen } from "@/lib/bookings";
import { isValidRoom, sanitizeText, rateLimit } from "@/lib/validation";
import { getDriver } from "@/lib/drivers";
import type { Driver } from "@/lib/types";
import { computeAmount, type BookingUnit } from "@/lib/payments";
import {
  sendEmail,
  bookingRequestEmail,
  bookingConfirmedEmail,
  paymentReceivedEmail,
} from "@/lib/email";

function emailData(driver: Driver, booking: Booking) {
  return {
    clientName: booking.clientName,
    driverName: `${driver.firstName} ${driver.lastName}`,
    vehicle: `${driver.car.make} ${driver.car.model}`,
    whenText: formatWhen(booking.when, "fr"),
    durationText: `${booking.hours} ${booking.unit === "day" ? "jour(s)" : "h"}`,
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

  const clientId = sanitizeText(body.clientId, 64);
  if (!clientId) {
    return Response.json({ error: "Missing client id" }, { status: 400 });
  }

  // Amount is recomputed server-side from the trusted driver price.
  const unit: BookingUnit = body.unit === "day" ? "day" : "hour";
  let amount;
  try {
    amount = computeAmount(
      driver.pricePerHour,
      driver.pricePerDay,
      unit,
      Number(body.hours ?? 1)
    );
  } catch {
    return Response.json({ error: "Invalid amount" }, { status: 400 });
  }

  const booking = createBooking({
    driverId,
    clientId,
    clientName: sanitizeText(body.clientName, 60) || "Client",
    clientEmail: sanitizeText(body.clientEmail, 120),
    hours: amount.hours,
    unit,
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
  if (status !== "confirmed" && status !== "refused" && status !== "paid") {
    return Response.json({ error: "Invalid status" }, { status: 400 });
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
