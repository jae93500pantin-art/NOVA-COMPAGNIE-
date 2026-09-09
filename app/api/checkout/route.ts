import { NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe";
import { isStripeConfigured } from "@/lib/config";
import { computeAmount, type BookingUnit } from "@/lib/payments";
import { transferFareForDriver } from "@/lib/transfer";
import { clampRate } from "@/lib/pricing";
import { getDirectoryDriver } from "@/lib/driverDirectory";
import { sanitizeText, rateLimit } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST → create a Stripe Checkout Session for a driver booking.
 *
 * Security:
 *  - amount is computed SERVER-SIDE from the trusted driver price (never trust
 *    a client-supplied amount → prevents price tampering);
 *  - per-IP rate limited;
 *  - returns { mode: "demo" } when Stripe isn't configured so the UI keeps its
 *    simulated confirmation (graceful degradation).
 */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const rl = rateLimit(`checkout:${ip}`, 10, 60_000); // 10 / min
  if (!rl.ok) {
    return Response.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  let body: { driverId?: string; hours?: number; unit?: string; bookingId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const driverId = sanitizeText(body.driverId, 64);
  const bookingId = sanitizeText(body.bookingId, 64);
  const driver = await getDirectoryDriver(driverId);
  if (!driver) {
    return Response.json({ error: "Unknown driver" }, { status: 404 });
  }

  // Amount is derived from the trusted server-side price, not the client.
  const unit: BookingUnit =
    body.unit === "day" || body.unit === "transfer" ? body.unit : "hour";
  let amount;
  try {
    // Driver-set rates are re-clamped to their class band before charging.
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

  // Demo mode: no Stripe key → tell the client to use the simulated flow.
  if (!isStripeConfigured) {
    return Response.json({ mode: "demo", amount });
  }

  const stripe = getStripe();
  if (!stripe) {
    return Response.json({ mode: "demo", amount });
  }

  const origin =
    req.headers.get("origin") ??
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Apple Pay & Google Pay appear automatically in Checkout when "card" is enabled.
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: amount.amountCents,
            product_data: {
              name: `Course avec ${driver.firstName} ${driver.lastName}`,
              description:
                unit === "transfer"
                  ? `${driver.car.make} ${driver.car.model} · Transfert aéroport (forfait)`
                  : `${driver.car.make} ${driver.car.model} · ${amount.hours} ${unit === "day" ? "jour(s)" : "h"}`,
            },
          },
        },
      ],
      metadata: {
        driverId: driver.id,
        bookingId,
        hours: String(amount.hours),
        total: String(amount.total),
      },
      success_url: `${origin}/compte/reservation?status=success&driver=${driver.id}&booking=${encodeURIComponent(bookingId)}`,
      cancel_url: `${origin}/compte/reservations?canceled=1`,
    });

    return Response.json({ mode: "stripe", url: session.url });
  } catch {
    return Response.json({ error: "Stripe error" }, { status: 502 });
  }
}
