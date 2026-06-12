"use client";

/**
 * Client-side helpers for course bookings (demo).
 *
 * - A stable per-browser client id identifies the requester so a client can
 *   filter the driver's booking room down to their own requests.
 * - The list of drivers a client has booked is tracked locally so the
 *   "Mes réservations" page knows which rooms to watch.
 */

const CLIENT_ID_KEY = "lumecar_client_id";
const BOOKED_KEY = "lumecar_booked_drivers";
export const BOOKED_EVENT = "lumecar:booked";

export function getClientId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export function getBookedDrivers(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(BOOKED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function rememberBookedDriver(driverId: string) {
  if (typeof window === "undefined") return;
  const list = getBookedDrivers();
  if (!list.includes(driverId)) {
    list.unshift(driverId);
    localStorage.setItem(BOOKED_KEY, JSON.stringify(list));
  }
  window.dispatchEvent(new CustomEvent(BOOKED_EVENT));
}
