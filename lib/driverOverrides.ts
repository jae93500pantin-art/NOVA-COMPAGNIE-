"use client";

/**
 * Local overrides for a driver's editable public profile fields (demo mode).
 * Lets a logged-in driver edit their tariff, bio and availability without a
 * backend. Stored in localStorage, keyed by driver id. In production these
 * would be persisted to Supabase.
 */

import type { Driver } from "./types";
import type { VehicleCategory } from "./types";
import { clampRate } from "./pricing";
import {
  DEFAULT_SCHEDULE,
  cloneSchedule,
  sanitizeSchedule,
  type WeeklySchedule,
} from "./schedule";

/** Vehicle description the driver writes themselves. */
export interface CarOverrides {
  make?: string;
  model?: string;
  year?: number;
  color?: string;
}

export interface DriverOverrides {
  bio?: string;
  /** Client price TTC per hour, set by the driver within their band. */
  pricePerHour?: number;
  /** Client price TTC per day, set by the driver within their band. */
  pricePerDay?: number;
  available?: boolean;
  /** Data-URL profile picture uploaded by the driver. */
  avatar?: string;
  /** Data-URL (or remote) photos of the driver's vehicle. */
  carPhotos?: string[];
  /** Make/model/year/colour, as typed by the driver. */
  car?: CarOverrides;
  /** Weekly availability hours (lib/schedule.ts). */
  schedule?: WeeklySchedule;
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
  const categories =
    o.categories && o.categories.length > 0 ? o.categories : driver.categories;
  // Rates are banded by the class the driver actually drives.
  const category = categories[0];
  return {
    ...driver,
    bio: o.bio ?? driver.bio,
    // Clamped on read too: a rate stored before a band changed must never
    // resurface as a live price outside it.
    pricePerHour: clampRate(
      category,
      "hour",
      o.pricePerHour ?? driver.pricePerHour
    ),
    pricePerDay: clampRate(category, "day", o.pricePerDay ?? driver.pricePerDay),
    available: o.available ?? driver.available,
    avatar: o.avatar || driver.avatar,
    categories,
    transferDestinations:
      o.transferDestinations ?? driver.transferDestinations,
    schedule: scheduleOf(driver, o),
    car: mergeCar(driver, o),
  };
}

/**
 * The driver's effective weekly hours: their own edit, else the schedule on the
 * record, else no constraint at all.
 */
export function scheduleOf(
  driver: Driver,
  o: DriverOverrides = getDriverOverrides(driver.id)
): WeeklySchedule {
  if (o.schedule) return sanitizeSchedule(o.schedule);
  if (driver.schedule) return sanitizeSchedule(driver.schedule);
  return cloneSchedule(DEFAULT_SCHEDULE);
}

/**
 * Merge the driver's own vehicle description over the base record. Blank
 * strings are ignored (an emptied field falls back to the original rather than
 * leaving the public profile with a nameless car).
 */
export function mergeCar(driver: Driver, o: DriverOverrides): Driver["car"] {
  return {
    ...driver.car,
    make: o.car?.make?.trim() || driver.car.make,
    model: o.car?.model?.trim() || driver.car.model,
    year: o.car?.year && o.car.year > 0 ? o.car.year : driver.car.year,
    color: o.car?.color?.trim() || driver.car.color,
    photos:
      o.carPhotos && o.carPhotos.length > 0 ? o.carPhotos : driver.car.photos,
  };
}
