import { NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe";
import { isStripeConfigured } from "@/lib/config";
import { computeBookingAmount } from "@/lib/payments";
import { getDriver } from "@/lib/drivers";
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

  let body: { driverId?: string; hours?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const driverId = sanitizeText(body.driverId, 64);
  const driver = getDriver(driverId);
  if (!driver) {
    return Response.json({ error: "Unknown driver" }, { status: 404 });
  }

  // Amount is derived from the trusted server-side price, not the client.
  let amount;
  try {
    amount = computeBookingAmount(driver.pricePerHour, Number(body.hours ?? 1));
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
              description: `${driver.car.make} ${driver.car.model} · ${amount.hours} h (frais de service inclus)`,
            },
          },
        },
      ],
      metadata: {
        driverId: driver.id,
        hours: String(amount.hours),
        total: String(amount.total),
      },
      success_url: `${origin}/compte/reservation?status=success&driver=${driver.id}`,
      cancel_url: `${origin}/drivers/${driver.id}?canceled=1`,
    });

    return Response.json({ mode: "stripe", url: session.url });
  } catch {
    return Response.json({ error: "Stripe error" }, { status: 502 });
  }
}
