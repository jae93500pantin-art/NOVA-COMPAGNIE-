/**
 * Airport-transfer domain data : aéroports, zones desservies, classes de
 * véhicule. Pur et testé.
 *
 * ## ⚠️ Ce module ne porte PLUS aucun prix
 *
 * Statut d'annuaire : la plateforme n'impose aucun tarif. Les forfaits par
 * classe (Berline 100 € / Van 150 € / Première 200 €), `estimateTransfer`,
 * `transferFareForDriver` et le `baseFare` de chaque aéroport ont été retirés —
 * c'étaient des prix décidés par Nova pour une prestation qu'elle ne vend pas.
 *
 * Ce qui reste est de la **mise en relation** : quelles classes existent, quels
 * chauffeurs desservent quel trajet. Le tarif affiché est celui que chaque
 * chauffeur annonce sur sa fiche.
 */

import { clampRate, isRateAcceptable, optionalRateError } from "./pricing";

export type TransferVehicleId = "business" | "van" | "premium";
export type TransferZoneId = "idf" | "cdg" | "orly" | "lbg";

export interface TransferAirport {
  id: string;
  /** IATA code, e.g. "CDG". */
  code: string;
  /** City id matching lib/cities.ts. */
  cityId: string;
  /** Display name. */
  name: string;
  /** Position on the stylised map, 0–100. */
  mapX: number;
  mapY: number;
  /** True for a city origin (e.g. Paris) rather than an airport hub. */
  origin?: boolean;
}

export interface TransferZone {
  id: TransferZoneId;
  /** i18n key suffix under `transfer.zone*`. */
  labelKey: string;
  /** Representative distance in km used for the estimate. */
  km: number;
  /** Matching entry in `transferDestinations` (what drivers opt into). */
  destinationId: string;
}

export interface TransferVehicle {
  id: TransferVehicleId;
  /** i18n key suffix under `transfer.veh*`. */
  labelKey: string;
}

export const airports: TransferAirport[] = [
  { id: "paris", code: "IDF", cityId: "paris", name: "Paris · Île-de-France", mapX: 50, mapY: 42, origin: true },
  { id: "cdg", code: "CDG", cityId: "paris", name: "Paris · Charles de Gaulle", mapX: 51, mapY: 36 },
  { id: "ory", code: "ORY", cityId: "paris", name: "Paris · Orly", mapX: 49, mapY: 40 },
  { id: "lbg", code: "LBG", cityId: "paris", name: "Paris · Le Bourget", mapX: 53, mapY: 38 },
];

export const zones: TransferZone[] = [
  { id: "idf", labelKey: "zoneIdf", km: 30, destinationId: "paris" },
  { id: "cdg", labelKey: "zoneCdg", km: 35, destinationId: "cdg" },
  { id: "orly", labelKey: "zoneOrly", km: 25, destinationId: "ory" },
  { id: "lbg", labelKey: "zoneLbg", km: 30, destinationId: "lbg" },
];

/**
 * The routes of the airport-transfer tab. Drivers tick the ones they accept in
 * their profile; a client is only ever proposed drivers who did.
 *
 * A route carries its **direction**: "Paris → CDG" and "CDG → Paris" are two
 * different jobs (pickup at a terminal vs drop-off at one), so a driver opts
 * into each side separately. `paris` predates the split and stays as the
 * catch-all "any airport → Paris" — drivers who ticked it keep their opt-in.
 */
export interface TransferDestination {
  id: string;
  /** Where the ride starts — proper noun, identical in FR and EN. */
  from: string;
  /** Where it ends. */
  to: string;
}

/** Written out often enough to be worth a constant. */
const IDF = "Paris · Île-de-France";

export const transferDestinations: TransferDestination[] = [
  { id: "paris", from: "Aéroport", to: IDF },
  // Paris → airport (departures)
  { id: "cdg", from: IDF, to: "Charles de Gaulle (CDG)" },
  { id: "ory", from: IDF, to: "Orly (ORY)" },
  { id: "lbg", from: IDF, to: "Le Bourget (LBG)" },
  // Airport → Paris (arrivals)
  { id: "cdg-paris", from: "Charles de Gaulle (CDG)", to: IDF },
  { id: "ory-paris", from: "Orly (ORY)", to: IDF },
  { id: "lbg-paris", from: "Le Bourget (LBG)", to: IDF },
];

export const getTransferDestination = (
  id: string | null | undefined
): TransferDestination | undefined =>
  transferDestinations.find((d) => d.id === id);

/* -------------------------------------------------------------------------- */
/*  Global airport opt-in                                                      */
/*                                                                             */
/*  Drivers opt in with a single switch: they accept every Paris ⇄ airport     */
/*  route, or none. That stays stored as the route list (`transfer_destinations`*/
/*  text[] + its GIN index) rather than a second boolean column — one source   */
/*  of truth, no migration, and "which drivers serve CDG?" is still a plain    */
/*  `transfer_destinations @> array['cdg']`.                                   */
/* -------------------------------------------------------------------------- */

/** Every bookable route — what the global opt-in expands to. */
export const ALL_TRANSFER_DESTINATION_IDS: string[] = transferDestinations.map(
  (d) => d.id
);

/**
 * Whether the driver accepts airport transfers. Deliberately lenient: **one**
 * route is enough. Profiles created before the switch existed hold partial
 * lists, and reading those as "refuses transfers" would silently drop drivers
 * out of every search. Saving normalises them back to the full list.
 */
export function acceptsAirportTransfers(driver: {
  transferDestinations?: string[];
}): boolean {
  return (driver.transferDestinations ?? []).length > 0;
}

/** The route list to store for a given switch position. */
export function transferDestinationsForOptIn(accepts: boolean): string[] {
  return accepts ? [...ALL_TRANSFER_DESTINATION_IDS] : [];
}

export const isKnownTransferDestination = (
  id: string | null | undefined
): boolean => Boolean(id) && transferDestinations.some((d) => d.id === id);

/** Full route label, e.g. "Orly (ORY) → Paris · Île-de-France". */
export const transferDestinationLabel = (d: TransferDestination): string =>
  `${d.from} → ${d.to}`;

/** Destination id behind the zone chosen in the transfer form. */
export const zoneDestinationId = (zoneId: string): string =>
  getZone(zoneId)?.destinationId ?? "";

/**
 * True when the driver ticked this destination. No destination selected → no
 * filter; a destination nobody ticked → the driver is excluded.
 */
export function driverServesTransferDestination(
  driver: { transferDestinations?: string[] },
  destinationId: string | null | undefined
): boolean {
  if (!isKnownTransferDestination(destinationId)) return true;
  return (driver.transferDestinations ?? []).includes(destinationId as string);
}

/** Drivers who ticked the destination (everyone when unfiltered). */
export function driversForTransferDestination<
  T extends { transferDestinations?: string[] }
>(list: T[], destinationId: string | null | undefined): T[] {
  if (!isKnownTransferDestination(destinationId)) return list;
  return list.filter((d) => driverServesTransferDestination(d, destinationId));
}

/** Keep only declared ids — used when saving a driver's opt-in list. */
export function sanitizeTransferDestinationIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return ids.filter(
    (id): id is string =>
      typeof id === "string" && isKnownTransferDestination(id)
  );
}

export const vehicles: TransferVehicle[] = [
  // "business" est la classe d'entrée : berline **et** moto. Une moto est une
  // option de véhicule, pas une autre classe.
  { id: "business", labelKey: "vehBusiness" },
  { id: "van", labelKey: "vehVan" },
  { id: "premium", labelKey: "vehPremium" },
];

/**
 * Classe de transfert d'un chauffeur, déduite des catégories déclarées sur sa
 * fiche — la meilleure qu'il peut offrir.
 *
 * ⚠️ C'est un **classement**, plus une tarification : la classe sert à filtrer
 * l'annuaire (« qui fait du van vers CDG ? »), elle ne détermine aucun prix.
 */
export function transferVehicleForCategories(
  categories: readonly string[] | undefined
): TransferVehicleId {
  const list = categories ?? [];
  if (list.includes("Luxury") || list.includes("Van Luxury")) return "premium";
  if (list.includes("Van")) return "van";
  return "business";
}

/**
 * Le chauffeur conduit-il exactement cette classe de transfert ? Même fonction
 * de classement que ci-dessus, pour que la classe affichée et les chauffeurs
 * listés ne puissent pas se contredire.
 */
export function driverHasTransferVehicle(
  driver: { categories?: readonly string[] },
  vehicleId: string | null | undefined
): boolean {
  if (!vehicleId || !getVehicle(vehicleId)) return true; // no filter
  return transferVehicleForCategories(driver.categories) === vehicleId;
}

/** Drivers of exactly this class (everyone when unfiltered). */
export function driversForTransferVehicle<
  T extends { categories?: readonly string[] }
>(list: T[], vehicleId: string | null | undefined): T[] {
  if (!vehicleId || !getVehicle(vehicleId)) return list;
  return list.filter((d) => driverHasTransferVehicle(d, vehicleId));
}

export const getAirport = (id: string) => airports.find((a) => a.id === id);
export const getZone = (id: string) => zones.find((z) => z.id === id);
export const getVehicle = (id: string) => vehicles.find((v) => v.id === id);

/* -------------------------------------------------------------------------- */
/*  Prix affiché pour un transfert                                            */
/* -------------------------------------------------------------------------- */

/**
 * Le prix qu'un chauffeur annonce pour un transfert, et son unité.
 *
 * ⚠️ **Toujours un prix du chauffeur, jamais un prix de Nova.** Son forfait
 * aéroport s'il en a annoncé un, sinon son tarif horaire — avec l'unité, pour
 * qu'un « 65 € » horaire ne se lise jamais comme le prix du trajet. Aucun des
 * deux : `null`, et rien ne s'affiche (pas de « 0 € », pas de valeur inventée).
 */
export type TransferPrice = { amount: number; unit: "flat" | "hour" };

/**
 * Les trois aéroports pour lesquels un chauffeur peut annoncer un forfait
 * distinct (2026-11-19). Les ids sont ceux de `airports`.
 */
export type AirportRateId = "cdg" | "ory" | "lbg";
export const AIRPORT_RATE_IDS: AirportRateId[] = ["cdg", "ory", "lbg"];
export const AIRPORT_RATE_LABELS: Record<AirportRateId, string> = {
  cdg: "Roissy Charles de Gaulle (CDG)",
  ory: "Orly (ORY)",
  lbg: "Le Bourget (LBG)",
};

/** Forfaits annoncés par aéroport. Absent ou 0 = pas de forfait annoncé. */
export type AirportFlatRates = Partial<Record<AirportRateId, number>>;

const isPositive = (n: number | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;

/** Un montant de forfait accepté (bornes `RATE_LIMITS.transfer`), arrondi, sinon `null`. */
function acceptFlatRate(raw: unknown): number | null {
  const n =
    typeof raw === "string" ? (raw.trim() === "" ? Number.NaN : Number(raw)) : raw;
  return typeof n === "number" && isRateAcceptable("transfer", n) ? Math.round(n) : null;
}

/**
 * Forfaits par aéroport tels qu'ils sont stockés (`profiles.airport_flat_rates`,
 * jsonb `{cdg, ory, lbg}`), re-bornés à la lecture : `profiles` est modifiable
 * par son propriétaire via PostgREST, une valeur peut donc arriver sans être
 * passée par la route qui valide. Hors bornes = non communiqué (absent), PAS
 * ramené au plafond.
 *
 * Tant qu'aucun forfait par aéroport n'est enregistré, l'ancien forfait unique
 * (`profiles.airport_flat_rate`) vaut pour les trois aéroports — c'était son sens.
 */
export function readAirportFlatRates(profile: {
  airport_flat_rates?: unknown;
  airport_flat_rate?: unknown;
}): AirportFlatRates {
  const out: AirportFlatRates = {};
  const map = profile.airport_flat_rates;
  if (map && typeof map === "object" && !Array.isArray(map)) {
    for (const id of AIRPORT_RATE_IDS) {
      const v = acceptFlatRate((map as Record<string, unknown>)[id]);
      if (v !== null) out[id] = v;
    }
    if (Object.keys(out).length > 0) return out;
  }
  const legacy = acceptFlatRate(profile.airport_flat_rate);
  if (legacy !== null) for (const id of AIRPORT_RATE_IDS) out[id] = legacy;
  return out;
}

/**
 * Forfaits envoyés par le formulaire → ce qu'on enregistre.
 *
 * Chaque forfait est FACULTATIF : vide ou 0 = pas de forfait pour cet
 * aéroport (la clé est omise). ⚠️ Une valeur saisie hors bornes est REFUSÉE
 * (message nommant l'aéroport), pas ramenée en silence : enregistrer autre
 * chose que ce que le chauffeur a tapé ferait changer son prix sans qu'il le
 * sache.
 */
export function parseAirportFlatRatesInput(
  raw: unknown
): { rates: AirportFlatRates; error: string | null } {
  const rates: AirportFlatRates = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { rates, error: null };
  }
  for (const id of AIRPORT_RATE_IDS) {
    const value = Number((raw as Record<string, unknown>)[id] ?? 0);
    const error = optionalRateError("transfer", value);
    if (error) return { rates: {}, error: `${AIRPORT_RATE_LABELS[id]} : ${error}` };
    const amount = clampRate("transfer", value);
    if (amount > 0) rates[id] = amount;
  }
  return { rates, error: null };
}

/**
 * L'aéroport concerné par un id d'aéroport (`cdg`) ou de trajet
 * (`cdg`, `cdg-paris`). `paris` (le fourre-tout « un aéroport → Paris ») et
 * l'origine Paris n'en désignent aucun : `null`.
 */
export function airportRateIdOf(id: string | null | undefined): AirportRateId | null {
  const head = (id ?? "").split("-")[0];
  return (AIRPORT_RATE_IDS as string[]).includes(head) ? (head as AirportRateId) : null;
}

/**
 * Le forfait d'un chauffeur pour un aéroport, ou — sans aéroport précis — le
 * plus bas de ses forfaits (« dès … »). `0` quand il n'en annonce aucun.
 */
export function airportFlatRateFor(
  rates: AirportFlatRates | undefined,
  airport?: AirportRateId | null
): number {
  if (airport) {
    const v = rates?.[airport];
    return isPositive(v) ? v : 0;
  }
  const declared = AIRPORT_RATE_IDS.map((id) => rates?.[id]).filter(isPositive);
  return declared.length > 0 ? Math.min(...declared) : 0;
}

export function transferPriceOf(
  driver: { airportFlatRates?: AirportFlatRates; pricePerHour: number },
  airport?: AirportRateId | null
): TransferPrice | null {
  const flat = airportFlatRateFor(driver.airportFlatRates, airport);
  if (flat > 0) return { amount: flat, unit: "flat" };
  if (Number.isFinite(driver.pricePerHour) && driver.pricePerHour > 0) {
    return { amount: driver.pricePerHour, unit: "hour" };
  }
  return null;
}

/**
 * Le « à partir de » d'une liste de chauffeurs : le **minimum** des prix
 * annoncés — jamais une moyenne, jamais une valeur choisie par la plateforme.
 *
 * ⚠️ On ne compare jamais un forfait à un tarif horaire : 70 € le trajet et
 * 60 €/h ne se classent pas. Dès qu'un chauffeur annonce un forfait, le
 * minimum porte sur les forfaits seuls (« Transfert dès … ») ; sinon sur les
 * tarifs horaires (« … / h »).
 */
export function transferFromPrice(
  drivers: { airportFlatRates?: AirportFlatRates; pricePerHour: number }[],
  airport?: AirportRateId | null
): TransferPrice | null {
  const prices = drivers
    .map((d) => transferPriceOf(d, airport))
    .filter((p): p is TransferPrice => p !== null);
  const flats = prices.filter((p) => p.unit === "flat");
  const pool = flats.length > 0 ? flats : prices;
  if (pool.length === 0) return null;
  return { amount: Math.min(...pool.map((p) => p.amount)), unit: pool[0].unit };
}
