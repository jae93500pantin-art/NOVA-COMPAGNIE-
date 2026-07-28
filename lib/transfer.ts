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
export type TransferZoneId = "idf" | "cdg" | "orly";

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
];

export const zones: TransferZone[] = [
  { id: "idf", labelKey: "zoneIdf", km: 30 },
  { id: "cdg", labelKey: "zoneCdg", km: 35 },
  { id: "orly", labelKey: "zoneOrly", km: 25 },
];

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
