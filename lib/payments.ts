/**
 * Pure payment-amount helpers (no side effects, fully unit-testable).
 *
 * The booking total = (price/hour × hours) + a 12% service fee.
 * Stripe expects integer amounts in the smallest currency unit (cents).
 */

export const SERVICE_FEE_RATE = 0;
export const MIN_HOURS = 1;
export const MAX_HOURS = 24;
export const MIN_DAYS = 1;
export const MAX_DAYS = 30;

/** Booking duration unit: charged either by the hour or by the day. */
export type BookingUnit = "hour" | "day";

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

/** Clamp a requested number of days into the allowed range. */
export function clampDays(days: number): number {
  if (Number.isNaN(days)) return MIN_DAYS;
  if (days === Infinity) return MAX_DAYS;
  if (days === -Infinity) return MIN_DAYS;
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.floor(days)));
}

/**
 * Compute a booking amount for either unit. Hours use the hourly rate; days use
 * the (cheaper) fixed daily rate. Throws on an invalid rate for the chosen unit.
 * `quantity` = number of hours or number of days depending on `unit`.
 */
export function computeAmount(
  pricePerHour: number,
  pricePerDay: number,
  unit: BookingUnit,
  quantity: number
): BookingAmount {
  if (unit === "day") {
    if (!Number.isFinite(pricePerDay) || pricePerDay <= 0) {
      throw new Error("Invalid pricePerDay");
    }
    const d = clampDays(quantity);
    const subtotal = pricePerDay * d;
    return {
      hours: d,
      subtotal,
      serviceFee: 0,
      total: subtotal,
      amountCents: Math.round(subtotal * 100),
    };
  }
  return computeBookingAmount(pricePerHour, quantity);
}
