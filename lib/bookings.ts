/** Booking (course request) domain types + pure helpers (unit-testable). */

import type { BookingUnit } from "./payments";

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "refused"
  | "paid"
  | "completed"
  | "cancelled";

export interface Booking {
  id: string;
  driverId: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  /** Quantity in the chosen unit (number of hours, or number of days). */
  hours: number;
  /** Whether the quantity is billed per hour or per day. */
  unit: BookingUnit;
  total: number; // euros
  pickup: string;
  dropoff: string;
  when: string;
  status: BookingStatus;
  createdAt: number;
}

export interface NewBookingInput {
  driverId: string;
  clientId: string;
  clientName: string;
  clientEmail?: string;
  hours: number;
  unit?: BookingUnit;
  total: number;
  pickup?: string;
  dropoff?: string;
  when?: string;
}

/**
 * Whether a status change is allowed.
 * pending   → confirmed | refused | cancelled  (driver decision, or give up)
 * confirmed → paid | cancelled                 (client pays after acceptance)
 * paid      → completed | cancelled            (ride happens, or is called off)
 * refused / completed / cancelled are terminal.
 */
export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  if (from === "pending") {
    return to === "confirmed" || to === "refused" || to === "cancelled";
  }
  if (from === "confirmed") return to === "paid" || to === "cancelled";
  if (from === "paid") return to === "completed" || to === "cancelled";
  return false;
}

export function statusLabel(status: BookingStatus): string {
  switch (status) {
    case "pending":
      return "En attente";
    case "confirmed":
      return "Acceptée — à payer";
    case "refused":
      return "Refusée";
    case "paid":
      return "Payée";
    case "completed":
      return "Terminée";
    case "cancelled":
      return "Annulée";
  }
}

/** Build a fully-formed Booking from raw input (applies defaults + clamps). */
export function buildBooking(
  input: NewBookingInput,
  idFactory: () => string = defaultId,
  now: () => number = Date.now
): Booking {
  const unit: BookingUnit = input.unit === "day" ? "day" : "hour";
  const maxQty = unit === "day" ? 30 : 24;
  return {
    id: idFactory(),
    driverId: input.driverId,
    clientId: input.clientId,
    clientName: input.clientName || "Client",
    clientEmail: input.clientEmail?.trim() || "",
    hours: Math.max(1, Math.min(maxQty, Math.floor(input.hours) || 1)),
    unit,
    total: Math.max(0, Math.round(input.total)),
    pickup: input.pickup?.trim() || "Adresse de départ",
    dropoff: input.dropoff?.trim() || "Destination",
    when: input.when?.trim() || "",
    status: "pending",
    createdAt: now(),
  };
}

function defaultId(): string {
  return `bk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/* -------------------------------------------------------------------------- */
/*  Scheduling helpers (pure, unit-testable) — let clients pick an exact date */
/* -------------------------------------------------------------------------- */

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** Today's date as a YYYY-MM-DD string (local). Used as the date input `min`. */
export function todayISODate(now: () => number = Date.now): string {
  const d = new Date(now());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Combine a date (YYYY-MM-DD) and an optional time (HH:mm) into the stored
 * `when` value: "YYYY-MM-DDTHH:mm", "YYYY-MM-DD", or "" when no date.
 */
export function composeWhen(date: string, time: string): string {
  if (!DATE_RE.test(date)) return "";
  return TIME_RE.test(time) ? `${date}T${time}` : date;
}

/**
 * Whether the chosen date (+ optional time) is valid and not in the past.
 * A date with no time is treated as valid until the end of that day.
 */
export function isFutureBooking(
  date: string,
  time: string,
  now: () => number = Date.now
): boolean {
  if (!DATE_RE.test(date)) return false;
  const hasTime = TIME_RE.test(time);
  const chosen = new Date(`${date}T${hasTime ? time : "23:59"}:00`);
  if (Number.isNaN(chosen.getTime())) return false;
  return chosen.getTime() >= now();
}

/**
 * Human-readable label for a stored `when` value, localised.
 * Accepts ISO ("YYYY-MM-DD" / "YYYY-MM-DDTHH:mm"), empty (→ "as soon as
 * possible"), or any legacy free-text (returned as-is).
 */
export function formatWhen(when: string, lang: "fr" | "en" = "fr"): string {
  if (!when || !when.trim()) {
    return lang === "fr" ? "Dès que possible" : "As soon as possible";
  }
  const m = when.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/);
  if (!m) return when; // legacy free text
  const [, y, mo, d, hh, mm] = m;
  const months = lang === "fr" ? MONTHS_FR : MONTHS_EN;
  const day = parseInt(d, 10);
  const month = months[parseInt(mo, 10) - 1] ?? mo;
  const datePart =
    lang === "fr" ? `${day} ${month} ${y}` : `${month} ${day}, ${y}`;
  if (hh && mm) {
    return lang === "fr"
      ? `${datePart} à ${hh}:${mm}`
      : `${datePart} at ${hh}:${mm}`;
  }
  return datePart;
}

/* -------------------------------------------------------------------------- */
/*  Auto-close (safety net) — a paid ride nobody closed manually               */
/* -------------------------------------------------------------------------- */

/** Grace period after the ride before it is auto-completed. */
export const AUTO_COMPLETE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Epoch ms the ride is considered to start.
 * Falls back to `createdAt` for bookings with no explicit date ("dès que
 * possible") or legacy free-text `when` values.
 */
export function bookingStartsAt(booking: Booking): number {
  const m = booking.when.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/);
  if (!m) return booking.createdAt;
  const [, y, mo, d, hh, mm] = m;
  const t = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    hh ? Number(hh) : 0,
    mm ? Number(mm) : 0
  ).getTime();
  return Number.isNaN(t) ? booking.createdAt : t;
}

/**
 * Whether a paid booking is old enough to be closed on its own, so a forgotten
 * ride never keeps its chat open forever. Only `paid` bookings auto-complete —
 * pending/confirmed ones are left alone (the driver may still act on them).
 */
export function shouldAutoComplete(
  booking: Booking,
  now: number = Date.now()
): boolean {
  if (booking.status !== "paid") return false;
  return now >= bookingStartsAt(booking) + AUTO_COMPLETE_AFTER_MS;
}

