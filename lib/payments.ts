/**
 * Pure payment-amount helpers (no side effects, fully unit-testable).
 *
 * Une course se facture ainsi :
 *   tarif course  = prix chauffeur × quantité (ou le forfait de transfert)
 *   frais client  = 5 % du tarif course
 *   total client  = tarif course + frais client
 * et, du côté chauffeur, une commission de 15 % prélevée sur le tarif course.
 * Le barème lui-même vit dans `lib/pricing.ts` — ce module ne fait que
 * l'appliquer à une quantité.
 *
 * Stripe expects integer amounts in the smallest currency unit (cents).
 */

import {
  CLIENT_SERVICE_FEE_RATE,
  priceBreakdown,
  round2,
} from "./pricing";

/**
 * Taux des frais de service supportés par le client.
 * ⚠️ Alias de `CLIENT_SERVICE_FEE_RATE` : un second chiffre vivant ici finirait
 * par diverger de celui qui décompose les revenus du chauffeur.
 */
export const SERVICE_FEE_RATE = CLIENT_SERVICE_FEE_RATE;
export const MIN_HOURS = 1;
export const MAX_HOURS = 24;
export const MIN_DAYS = 1;
export const MAX_DAYS = 30;

/**
 * How a booking is billed: by the hour, by the day, or as a flat airport
 * transfer (a single trip, priced per vehicle class — see lib/transfer.ts).
 */
export type BookingUnit = "hour" | "day" | "transfer";

export interface BookingAmount {
  hours: number;
  /** Tarif course : ce que le chauffeur a fixé, hors frais. En euros. */
  subtotal: number;
  /** Frais de service plateforme (5 %), à la charge du client. En euros. */
  serviceFee: number;
  /** Ce que le client règle : `subtotal + serviceFee`. En euros. */
  total: number;
  /** Commission (15 %) prélevée au chauffeur sur `subtotal`. En euros. */
  commission: number;
  /** Ce que le chauffeur encaisse : `subtotal − commission`. En euros. */
  driverNet: number;
  /** `total` en centimes entiers, pour Stripe. */
  amountCents: number;
}

/** Clamp the requested hours into the allowed range. */
export function clampHours(hours: number): number {
  if (Number.isNaN(hours)) return MIN_HOURS;
  if (hours === Infinity) return MAX_HOURS;
  if (hours === -Infinity) return MIN_HOURS;
  return Math.min(MAX_HOURS, Math.max(MIN_HOURS, Math.floor(hours)));
}

/**
 * Applique le barème à un tarif course déjà calculé.
 *
 * ⚠️ Seul point du module où les frais et la commission sont posés : les trois
 * unités de facturation passent par ici. Une unité qui calculerait sa part de
 * son côté est une unité qui oubliera la prochaine évolution du barème — c'est
 * exactement ce qui était arrivé au transfert et à la journée, restés à zéro
 * frais quand la facturation à l'heure en avait.
 */
function billed(subtotal: number, hours: number): BookingAmount {
  const split = priceBreakdown(subtotal);
  return {
    hours,
    subtotal: split.driverPrice,
    serviceFee: split.clientFee,
    total: split.clientTotal,
    commission: split.commission,
    driverNet: split.driverNet,
    // Depuis le total arrondi au centime : passer par le produit brut
    // rouvrirait la porte au flottant (105.00000000000001 → 10500.000000000002).
    amountCents: Math.round(split.clientTotal * 100),
  };
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
  return billed(round2(pricePerHour * h), h);
}

/** Clamp a requested number of days into the allowed range. */
export function clampDays(days: number): number {
  if (Number.isNaN(days)) return MIN_DAYS;
  if (days === Infinity) return MAX_DAYS;
  if (days === -Infinity) return MIN_DAYS;
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.floor(days)));
}

/**
 * Compute a booking amount for any unit. Hours use the hourly rate; days use
 * the (cheaper) fixed daily rate; a transfer is a flat fare and ignores
 * `quantity` (one trip). Throws on an invalid rate for the chosen unit.
 * `quantity` = number of hours or number of days depending on `unit`.
 */
export function computeAmount(
  pricePerHour: number,
  pricePerDay: number,
  unit: BookingUnit,
  quantity: number,
  transferFare = 0
): BookingAmount {
  if (unit === "transfer") {
    if (!Number.isFinite(transferFare) || transferFare <= 0) {
      throw new Error("Invalid transferFare");
    }
    // Un forfait : la quantité ne s'applique pas (un trajet).
    return billed(Math.round(transferFare), 1);
  }
  if (unit === "day") {
    if (!Number.isFinite(pricePerDay) || pricePerDay <= 0) {
      throw new Error("Invalid pricePerDay");
    }
    const d = clampDays(quantity);
    return billed(round2(pricePerDay * d), d);
  }
  return computeBookingAmount(pricePerHour, quantity);
}
