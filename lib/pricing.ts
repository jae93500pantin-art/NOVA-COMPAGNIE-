/**
 * Driver pricing: per-category rate bands + the platform commission split.
 * Pure and unit-tested — the same rules run in the profile form and on the
 * server, so a rate can never be stored outside its band.
 *
 * Every amount here is the **client price, TTC**. The commission is taken *out*
 * of it, never added on top: the client pays what the driver advertises.
 */

import type { VehicleCategory } from "./types";

/** Platform share of the client price (TTC). */
export const PLATFORM_COMMISSION_RATE = 0.25;

export type RateUnit = "hour" | "day";

export interface PriceBand {
  minHour: number;
  maxHour: number;
  minDay: number;
  maxDay: number;
}

/**
 * Standard classes are **not negotiable**: 120 €/h and 1000 €/day for everyone.
 * A fixed price is modelled as a band of width zero rather than a separate
 * case, so validation, clamping and the server path need no special handling —
 * `clampRate` simply has nowhere else to land.
 */
const STANDARD: PriceBand = {
  minHour: 120,
  maxHour: 120,
  minDay: 1000,
  maxDay: 1000,
};

/** Premium classes — the driver prices their exact model within these bounds. */
const PREMIUM: PriceBand = {
  minHour: 150,
  maxHour: 250,
  minDay: 1500,
  maxDay: 3000,
};

export const PRICE_BANDS: Record<VehicleCategory, PriceBand> = {
  Business: STANDARD,
  Moto: STANDARD,
  Van: STANDARD,
  "Van Luxury": PREMIUM,
  Luxury: PREMIUM,
};

export function bandFor(category: VehicleCategory | undefined): PriceBand {
  return (category && PRICE_BANDS[category]) || STANDARD;
}

/** Lower/upper bound for one unit of one class. */
export function boundsFor(
  category: VehicleCategory | undefined,
  unit: RateUnit
): { min: number; max: number } {
  const b = bandFor(category);
  return unit === "day"
    ? { min: b.minDay, max: b.maxDay }
    : { min: b.minHour, max: b.maxHour };
}

/**
 * Whether the driver may set this rate at all. False for the standard classes,
 * whose band has a single allowed value.
 */
export function isRateEditable(
  category: VehicleCategory | undefined,
  unit: RateUnit
): boolean {
  const { min, max } = boundsFor(category, unit);
  return max > min;
}

/** True when the class is priced by the platform, not by the driver. */
export function hasFixedPricing(category: VehicleCategory | undefined): boolean {
  return !isRateEditable(category, "hour") && !isRateEditable(category, "day");
}

export function isRateInBand(
  category: VehicleCategory | undefined,
  unit: RateUnit,
  value: number
): boolean {
  if (!Number.isFinite(value)) return false;
  const { min, max } = boundsFor(category, unit);
  return value >= min && value <= max;
}

/**
 * Force a rate into its band. Used server-side: a stored rate that predates a
 * band change (or was tampered with) must still bill something legitimate.
 */
export function clampRate(
  category: VehicleCategory | undefined,
  unit: RateUnit,
  value: number
): number {
  const { min, max } = boundsFor(category, unit);
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** French error message for the profile form, or null when the rate is fine. */
export function rateError(
  category: VehicleCategory | undefined,
  unit: RateUnit,
  value: number
): string | null {
  if (!Number.isFinite(value) || value <= 0) return "Indiquez un tarif.";
  const { min, max } = boundsFor(category, unit);
  if (value < min || value > max) {
    const what = unit === "day" ? "journalier" : "horaire";
    if (min === max) {
      return `Tarif ${what} imposé pour cette gamme : ${min} € TTC.`;
    }
    return `Tarif ${what} autorisé pour cette gamme : ${min} € à ${max} € TTC.`;
  }
  return null;
}

export interface RateSplit {
  /** What the client pays. */
  ttc: number;
  /** What the platform keeps. */
  commission: number;
  /** What the driver receives. */
  net: number;
}

/**
 * Split a client price into commission + driver net.
 * `net` is derived by subtraction so the two always add back up to `ttc` —
 * rounding both independently is how platforms end up a euro short.
 */
export function splitRate(
  ttc: number,
  rate: number = PLATFORM_COMMISSION_RATE
): RateSplit {
  if (!Number.isFinite(ttc) || ttc <= 0) {
    return { ttc: 0, commission: 0, net: 0 };
  }
  const commission = Math.round(ttc * rate);
  return { ttc: Math.round(ttc), commission, net: Math.round(ttc) - commission };
}

export const commissionOn = (ttc: number): number => splitRate(ttc).commission;
export const driverNetOn = (ttc: number): number => splitRate(ttc).net;
