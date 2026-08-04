/**
 * Airport-transfer domain data + pure pricing helpers.
 *
 * The estimate is deterministic and side-effect free so it can be unit-tested
 * and reused on both the transfer page and (later) a real quote endpoint.
 *
 * Pricing is a flat fare per vehicle type (Île-de-France transfers):
 *   estimate = vehicle.price
 */

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
  /** Flat base fare (euros) covering terminal pickup + first kilometres. */
  baseFare: number;
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
  /** Flat fare in euros for an Île-de-France transfer. */
  price: number;
}

export const airports: TransferAirport[] = [
  { id: "paris", code: "IDF", cityId: "paris", name: "Paris · Île-de-France", baseFare: 40, mapX: 50, mapY: 42, origin: true },
  { id: "cdg", code: "CDG", cityId: "paris", name: "Paris · Charles de Gaulle", baseFare: 45, mapX: 51, mapY: 36 },
  { id: "ory", code: "ORY", cityId: "paris", name: "Paris · Orly", baseFare: 40, mapX: 49, mapY: 40 },
  { id: "lbg", code: "LBG", cityId: "paris", name: "Paris · Le Bourget", baseFare: 45, mapX: 53, mapY: 38 },
];

export const zones: TransferZone[] = [
  { id: "idf", labelKey: "zoneIdf", km: 30, destinationId: "paris" },
  { id: "cdg", labelKey: "zoneCdg", km: 35, destinationId: "cdg" },
  { id: "orly", labelKey: "zoneOrly", km: 25, destinationId: "ory" },
  { id: "lbg", labelKey: "zoneLbg", km: 30, destinationId: "lbg" },
];

/**
 * The four destinations of the airport-transfer tab. Drivers tick the ones they
 * accept in their profile; a client is only ever proposed drivers who did.
 */
export interface TransferDestination {
  id: string;
  /** Proper noun — identical in FR and EN. */
  name: string;
  /** IATA code for airports. */
  code?: string;
}

export const transferDestinations: TransferDestination[] = [
  { id: "paris", name: "Paris · Île-de-France" },
  { id: "cdg", name: "Paris · Charles de Gaulle", code: "CDG" },
  { id: "ory", name: "Paris · Orly", code: "ORY" },
  { id: "lbg", name: "Paris · Le Bourget", code: "LBG" },
];

export const getTransferDestination = (
  id: string | null | undefined
): TransferDestination | undefined =>
  transferDestinations.find((d) => d.id === id);

export const isKnownTransferDestination = (
  id: string | null | undefined
): boolean => Boolean(id) && transferDestinations.some((d) => d.id === id);

/** Full label with IATA code, e.g. "Paris · Orly (ORY)". */
export const transferDestinationLabel = (d: TransferDestination): string =>
  d.code ? `${d.name} (${d.code})` : d.name;

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
  { id: "business", labelKey: "vehBusiness", price: 100 },
  { id: "van", labelKey: "vehVan", price: 150 },
  { id: "premium", labelKey: "vehPremium", price: 200 },
];

export const getAirport = (id: string) => airports.find((a) => a.id === id);
export const getZone = (id: string) => zones.find((z) => z.id === id);
export const getVehicle = (id: string) => vehicles.find((v) => v.id === id);

/**
 * Estimate a transfer fare in euros (flat fare per vehicle type). Returns 0 for
 * unknown inputs so the UI can decide how to render rather than throwing.
 */
export function estimateTransfer(
  airportId: string,
  zoneId: string,
  vehicleId: string
): number {
  const airport = getAirport(airportId);
  const zone = getZone(zoneId);
  const vehicle = getVehicle(vehicleId);
  if (!airport || !zone || !vehicle) return 0;
  return vehicle.price;
}
