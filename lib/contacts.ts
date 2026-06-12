"use client";

/**
 * Tracks which drivers a client has started a conversation with, so the
 * messaging page can list real conversations. Stored locally (demo).
 *
 * A client↔driver conversation maps to a deterministic live-chat room:
 *   roomForDriver(driverId)  →  "dm-<driverId>"
 * Both the client (who contacted the driver) and the driver (logged in) join
 * the same room, giving a real-time conversation over SSE.
 */

const KEY = "lumecar_contacts";
const EVENT = "lumecar:contacts";

export function roomForDriver(driverId: string) {
  return `dm-${driverId}`;
}

export function getContacts(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function addContact(driverId: string) {
  if (typeof window === "undefined") return;
  const list = getContacts();
  if (list.includes(driverId)) return; // already present — no event, avoids loops
  list.unshift(driverId);
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export const CONTACTS_EVENT = EVENT;
