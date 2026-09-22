/**
 * Driver pricing: per-category rate bands + the platform economics.
 * Pure and unit-tested — the same rules run in the profile form and on the
 * server, so a rate can never be stored outside its band.
 *
 * ## Le barème (deux prélèvements distincts, sur deux bases distinctes)
 *
 * Le **prix chauffeur** (`pricePerHour` × heures, `pricePerDay` × jours, ou le
 * forfait de transfert) est la base de tout le calcul. Ni le client ni le
 * chauffeur ne le paient ni ne l'encaissent tel quel :
 *
 * - le client règle ce prix **+ 5 % de frais de gestion** ;
 * - le chauffeur touche ce prix **− 15 % de commission**.
 *
 * ⚠️ Les deux taux ne s'additionnent pas en un « 20 % » : ils ne s'appliquent
 * pas au même montant et ne se lisent pas au même endroit. Les confondre
 * afficherait au client une commission qu'il ne paie pas, et au chauffeur des
 * frais qu'il ne supporte pas. La marge de la plateforme est leur **somme**
 * (`platformMargin`), jamais un troisième pourcentage.
 *
 * ⚠️ Un tarif affiché reste un **prix TTC**. Les bandes ci-dessous encadrent le
 * prix chauffeur, pas le prix client : c'est ce que le chauffeur saisit.
 */

import type { VehicleCategory } from "./types";

/** Commission prélevée **sur** le prix du chauffeur (déduite de son revenu). */
export const PLATFORM_COMMISSION_RATE = 0.15;

/** Frais de gestion **ajoutés** au prix du chauffeur, à la charge du client. */
export const CLIENT_SERVICE_FEE_RATE = 0.05;

/**
 * Arrondi au centime. Tout l'argent de ce module y passe : arrondir à l'euro
 * ferait mentir une facture dès que 5 % tombe sur une demie (170 € → 8,50 €).
 */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

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

/**
 * La décomposition complète d'une course, les deux côtés du guichet.
 * Toutes les valeurs sont en euros, arrondies au centime.
 */
export interface PriceBreakdown {
  /** Le prix fixé par le chauffeur — la base de tout le reste. */
  driverPrice: number;
  /** Frais de gestion à la charge du client (5 %). */
  clientFee: number;
  /** Ce que le client règle : prix chauffeur + frais. */
  clientTotal: number;
  /** Commission prélevée au chauffeur (15 %). */
  commission: number;
  /** Ce que le chauffeur encaisse : prix chauffeur − commission. */
  driverNet: number;
  /** Ce que la plateforme garde : frais client + commission chauffeur. */
  platformMargin: number;
}

const EMPTY_BREAKDOWN: PriceBreakdown = {
  driverPrice: 0,
  clientFee: 0,
  clientTotal: 0,
  commission: 0,
  driverNet: 0,
  platformMargin: 0,
};

/**
 * Décompose un prix chauffeur en ce que paie le client et ce qu'encaisse le
 * chauffeur.
 *
 * Deux règles de dérivation, et elles ne sont pas décoratives :
 *
 * - `clientTotal` est obtenu par **addition** (`prix + frais`) et non en
 *   recalculant `prix × 1,05`. Les deux coïncident pour les tarifs entiers que
 *   produisent les bandes, mais sur un montant qui tombe mal ils peuvent
 *   diverger d'un centime — et une facture dont le total ne vaut pas la somme
 *   de ses lignes est une facture qu'on ne peut pas défendre.
 * - `driverNet` est obtenu par **soustraction**, pour la même raison :
 *   arrondir la commission et le net chacun de son côté, c'est finir à un
 *   centime près du compte.
 */
export function priceBreakdown(driverPrice: number): PriceBreakdown {
  if (!Number.isFinite(driverPrice) || driverPrice <= 0) {
    return { ...EMPTY_BREAKDOWN };
  }
  const base = round2(driverPrice);
  const clientFee = round2(base * CLIENT_SERVICE_FEE_RATE);
  const commission = round2(base * PLATFORM_COMMISSION_RATE);
  return {
    driverPrice: base,
    clientFee,
    clientTotal: round2(base + clientFee),
    commission,
    driverNet: round2(base - commission),
    platformMargin: round2(clientFee + commission),
  };
}

/**
 * Le chemin inverse : retrouver la décomposition depuis le total client.
 *
 * ⚠️ Une réservation ne stocke que son total client (`bookings.total`). Le
 * détail se **redérive** plutôt que d'être dupliqué en base : une colonne
 * figée au moment de la course prendrait le barème d'alors, et l'affichage
 * mentirait le jour où le taux bouge. Le prix chauffeur est reconstitué, puis
 * les frais par différence, pour que le total affiché reste **exactement**
 * celui qui a été facturé.
 */
export function breakdownFromClientTotal(clientTotal: number): PriceBreakdown {
  if (!Number.isFinite(clientTotal) || clientTotal <= 0) {
    return { ...EMPTY_BREAKDOWN };
  }
  const total = round2(clientTotal);
  const driverPrice = round2(total / (1 + CLIENT_SERVICE_FEE_RATE));
  const clientFee = round2(total - driverPrice);
  const commission = round2(driverPrice * PLATFORM_COMMISSION_RATE);
  return {
    driverPrice,
    clientFee,
    clientTotal: total,
    commission,
    driverNet: round2(driverPrice - commission),
    platformMargin: round2(clientFee + commission),
  };
}

/** Commission prélevée sur un prix chauffeur. */
export const commissionOn = (driverPrice: number): number =>
  priceBreakdown(driverPrice).commission;

/** Revenu net du chauffeur pour un prix chauffeur donné. */
export const driverNetOn = (driverPrice: number): number =>
  priceBreakdown(driverPrice).driverNet;

/** Total réglé par le client pour un prix chauffeur donné. */
export const clientTotalOn = (driverPrice: number): number =>
  priceBreakdown(driverPrice).clientTotal;
