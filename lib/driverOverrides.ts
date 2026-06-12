"use client";

/**
 * Local overrides for a driver's editable public profile fields (demo mode).
 * Lets a logged-in driver edit their tariff, bio and availability without a
 * backend. Stored in localStorage, keyed by driver id. In production these
 * would be persisted to Supabase.
 */

import type { Driver } from "./types";

export interface DriverOverrides {
  bio?: string;
  pricePerHour?: number;
  available?: boolean;
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

export function saveDriverOverrides(
  driverId: string,
  patch: DriverOverrides
): void {
  if (typeof window === "undefined") return;
  const store = readStore();
  store[driverId] = { ...store[driverId], ...patch };
  localStorage.setItem(KEY, JSON.stringify(store));
  window.dispatchEvent(new CustomEvent(DRIVER_OVERRIDES_EVENT));
}

/** Merge a base driver with any locally-saved overrides. */
export function applyDriverOverrides(driver: Driver): Driver {
  const o = getDriverOverrides(driver.id);
  return {
    ...driver,
    bio: o.bio ?? driver.bio,
    pricePerHour: o.pricePerHour ?? driver.pricePerHour,
    available: o.available ?? driver.available,
  };
}
