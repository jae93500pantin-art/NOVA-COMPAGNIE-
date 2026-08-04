"use client";

/**
 * Local overrides for a driver's editable public profile fields (demo mode).
 * Lets a logged-in driver edit their tariff, bio and availability without a
 * backend. Stored in localStorage, keyed by driver id. In production these
 * would be persisted to Supabase.
 */

import type { Driver } from "./types";
import type { VehicleCategory } from "./types";

export interface DriverOverrides {
  bio?: string;
  pricePerHour?: number;
  available?: boolean;
  /** Data-URL (or remote) photos of the driver's vehicle. */
  carPhotos?: string[];
  /** Driver-selected vehicle categories. */
  categories?: VehicleCategory[];
  /**
   * Transfer destinations the driver accepts (lib/transfer.ts). An empty array
   * is meaningful — "I accept none" — so it is merged as-is, unlike
   * `categories`.
   */
  transferDestinations?: string[];
}

const KEY = "lumecar_driver_overrides";
export const DRIVER_OVERRIDES_EVENT = "lumecar:driver-overrides";

type Store = Record<string, DriverOverrides>;

function readStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

export function getDriverOverrides(driverId: string): DriverOverrides {
  return readStore()[driverId] ?? {};
}

/**
 * Persist a patch of overrides. Returns false if storage failed (e.g. the
 * browser quota was exceeded by large photo data-URLs).
 */
export function saveDriverOverrides(
  driverId: string,
  patch: DriverOverrides
): boolean {
  if (typeof window === "undefined") return false;
  const store = readStore();
  store[driverId] = { ...store[driverId], ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    return false;
  }
  window.dispatchEvent(new CustomEvent(DRIVER_OVERRIDES_EVENT));
  return true;
}

/** Merge a base driver with any locally-saved overrides. */
export function applyDriverOverrides(driver: Driver): Driver {
  const o = getDriverOverrides(driver.id);
  return {
    ...driver,
    bio: o.bio ?? driver.bio,
    pricePerHour: o.pricePerHour ?? driver.pricePerHour,
    available: o.available ?? driver.available,
    categories:
      o.categories && o.categories.length > 0 ? o.categories : driver.categories,
    transferDestinations:
      o.transferDestinations ?? driver.transferDestinations,
    car: {
      ...driver.car,
      photos:
        o.carPhotos && o.carPhotos.length > 0 ? o.carPhotos : driver.car.photos,
    },
  };
}
