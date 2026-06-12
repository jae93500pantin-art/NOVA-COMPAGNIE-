/**
 * Pure payment-amount helpers (no side effects, fully unit-testable).
 *
 * The booking total = (price/hour × hours) + a 12% service fee.
 * Stripe expects integer amounts in the smallest currency unit (cents).
 */

export const SERVICE_FEE_RATE = 0.12;
export const MIN_HOURS = 1;
export const MAX_HOURS = 24;

export interface BookingAmount {
  hours: number;
  subtotal: number; // euros
  serviceFee: number; // euros
  total: number; // euros
  amountCents: number; // integer cents for Stripe
}

/** Clamp the requested hours into the allowed range. */
export function clampHours(hours: number): number {
  if (Number.isNaN(hours)) return MIN_HOURS;
  if (hours === Infinity) return MAX_HOURS;
  if (hours === -Infinity) return MIN_HOURS;
  return Math.min(MAX_HOURS, Math.max(MIN_HOURS, Math.floor(hours)));
}

/**
 * Compute a booking amount. Throws on an invalid hourly price so a bad
 * driver record can never produce a zero/negative charge.
 */
export function computeBookingAmount(
  pricePerHour: number,
  hours: number
): BookingAmount {
  if (!Number.isFinite(pricePerHour) || pricePerHour <= 0) {
    throw new Error("Invalid pricePerHour");
  }
  const h = clampHours(hours);
  const subtotal = pricePerHour * h;
  const serviceFee = Math.round(subtotal * SERVICE_FEE_RATE);
  const total = subtotal + serviceFee;
  return {
    hours: h,
    subtotal,
    serviceFee,
    total,
    amountCents: Math.round(total * 100),
  };
}
