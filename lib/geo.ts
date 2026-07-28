import type { Driver } from "./types";

/** Real-world coordinates [lng, lat] for each supported city centre. */
export const cityCoords: Record<string, [number, number]> = {
  paris: [2.3522, 48.8566],
};

/**
 * Derive a believable live position for a driver by scattering them
 * around their city centre, using their stylised map offsets as a
 * deterministic seed.
 */
export function driverCoords(driver: Driver): [number, number] {
  if (driver.lng != null && driver.lat != null) {
    return [driver.lng, driver.lat];
  }
  const center = cityCoords[driver.cityId] ?? [2.3522, 48.8566];
  const spread = 0.08; // ~ a few km
  const lng = center[0] + ((driver.mapX - 50) / 50) * spread;
  const lat = center[1] - ((driver.mapY - 50) / 50) * spread;
  return [lng, lat];
}
