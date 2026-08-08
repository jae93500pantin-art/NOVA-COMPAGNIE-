/** Booking (course request) domain types + pure helpers (unit-testable). */

import type { BookingUnit } from "./payments";
import { addDays } from "./calendar";
import {
  getTransferDestination,
  isKnownTransferDestination,
  transferDestinationLabel,
} from "./transfer";

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
  /** Quantity in the chosen unit (hours, days, or 1 for a transfer). */
  hours: number;
  /** Whether the quantity is billed per hour, per day, or as a flat transfer. */
  unit: BookingUnit;
  /** Transfer destination id (lib/transfer.ts) — only set when unit = "transfer". */
  transfer?: string;
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
  transfer?: string;
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

/**
 * Placeholders used when no address was captured. The booking flow does not
 * collect addresses yet, so these are labels, **not data** — anything that
 * publishes a trip must treat them as "unknown" rather than print them.
 */
export const DEFAULT_PICKUP = "Adresse de départ";
export const DEFAULT_DROPOFF = "Destination";

/** Build a fully-formed Booking from raw input (applies defaults + clamps). */
export function buildBooking(
  input: NewBookingInput,
  idFactory: () => string = defaultId,
  now: () => number = Date.now
): Booking {
  const unit: BookingUnit =
    input.unit === "day" || input.unit === "transfer" ? input.unit : "hour";
  // A transfer is a single trip; hours/days keep their own ceilings.
  const maxQty = unit === "transfer" ? 1 : unit === "day" ? 30 : 24;
  const transfer =
    unit === "transfer" && isKnownTransferDestination(input.transfer)
      ? input.transfer
      : undefined;
  return {
    id: idFactory(),
    driverId: input.driverId,
    clientId: input.clientId,
    clientName: input.clientName || "Client",
    clientEmail: input.clientEmail?.trim() || "",
    hours: Math.max(1, Math.min(maxQty, Math.floor(input.hours) || 1)),
    unit,
    transfer,
    total: Math.max(0, Math.round(input.total)),
    pickup: input.pickup?.trim() || DEFAULT_PICKUP,
    dropoff: input.dropoff?.trim() || DEFAULT_DROPOFF,
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
 * Compact "what was booked" label for a booking row: a duration ("3 h", "2 j")
 * or, for a flat airport transfer, the destination itself.
 */
export function bookingQuantityLabel(
  booking: Pick<Booking, "hours" | "unit" | "transfer">,
  lang: "fr" | "en" = "fr"
): string {
  if (booking.unit === "transfer") {
    const prefix = lang === "fr" ? "Transfert" : "Transfer";
    const dest = getTransferDestination(booking.transfer);
    return dest ? `${prefix} ${transferDestinationLabel(dest)}` : prefix;
  }
  const suffix = booking.unit === "day" ? (lang === "fr" ? "j" : "d") : "h";
  return `${booking.hours} ${suffix}`;
}

/**
 * Uber-style rescheduling: when the chosen time has already passed **today**,
 * keep the time and move the booking to tomorrow instead of refusing it.
 * Returns the date to use plus whether a roll happened, so the UI can say so.
 * A future date, a past day or an incomplete input is returned untouched —
 * `isFutureBooking` stays the safety net for those.
 */
export function rollPastTimeToNextDay(
  date: string,
  time: string,
  now: () => number = Date.now
): { date: string; rolled: boolean } {
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) return { date, rolled: false };
  if (isFutureBooking(date, time, now)) return { date, rolled: false };
  // Only today rolls forward: a date in the past is a deliberate mistake.
  if (date !== todayISODate(now)) return { date, rolled: false };
  return { date: addDays(date, 1), rolled: true };
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

/** Assumed length of a flat airport transfer when nothing else says otherwise. */
export const TRANSFER_DURATION_MS = 2 * 60 * 60 * 1000;

/** How long the ride itself lasts, from its unit and quantity. */
export function bookingDurationMs(booking: Booking): number {
  if (booking.unit === "transfer") return TRANSFER_DURATION_MS;
  const hours = booking.unit === "day" ? booking.hours * 24 : booking.hours;
  return Math.max(1, hours) * 60 * 60 * 1000;
}

/** Epoch ms the ride is considered over. */
export function bookingEndsAt(booking: Booking): number {
  return bookingStartsAt(booking) + bookingDurationMs(booking);
}

/**
 * Whether this ride is happening right now. Paid only: a request the driver
 * has not been paid for is not a ride, however close its date is.
 */
export function isRideInProgress(
  booking: Booking,
  now: number = Date.now()
): boolean {
  if (booking.status !== "paid") return false;
  const start = bookingStartsAt(booking);
  return now >= start && now < bookingEndsAt(booking);
}

/**
 * What a driver's status pill should say.
 *
 * "in_ride" is **derived, never stored**: a status the driver has to toggle by
 * hand is a status they forget to turn off, and they then vanish from the
 * platform for days with nothing to explain it. It comes out of the bookings,
 * so it cannot drift.
 */
export type DriverPresence = "in_ride" | "online" | "offline";

export function driverPresence(
  bookings: Booking[],
  available: boolean,
  now: number = Date.now()
): DriverPresence {
  if (bookings.some((b) => isRideInProgress(b, now))) return "in_ride";
  return available ? "online" : "offline";
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

