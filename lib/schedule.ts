/**
 * Weekly availability schedule for a driver (pure, unit-testable, no DOM).
 *
 * This is the *planning* half of the driver status: it says when the driver
 * accepts rides **booked in advance**, independently of whether they happen to
 * be online right now. Every booking in Nova is scheduled, so this is what
 * actually gates the date picker — the online/offline switch only ever speaks
 * about the present moment.
 *
 * Days are Monday-first (0 = Mon … 6 = Sun) to match lib/calendar.ts.
 */

import { parseISO } from "./calendar";

export interface DaySchedule {
  /** The driver works that day at all. */
  open: boolean;
  /** First bookable time, "HH:mm". */
  start: string;
  /** Last bookable time, "HH:mm" (inclusive). */
  end: string;
}

/** Exactly 7 entries, Monday-first. */
export type WeeklySchedule = DaySchedule[];

/** Real clock times only — "25:99" has the right shape but is not a time. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const DAY_LABELS_FR = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

const OPEN_ALL_DAY: DaySchedule = { open: true, start: "00:00", end: "23:59" };

/**
 * Default = always available. A driver who never touched their planning must
 * behave exactly as before the feature existed — narrowing availability is an
 * opt-in decision, never a silent side effect of an upgrade.
 */
export const DEFAULT_SCHEDULE: WeeklySchedule = Array.from(
  { length: 7 },
  () => ({ ...OPEN_ALL_DAY })
);

/** Common starting point offered in the profile editor: Mon–Fri, 07:00–19:00. */
export const PRESET_WEEKDAYS: WeeklySchedule = Array.from(
  { length: 7 },
  (_, i) => ({ open: i < 5, start: "07:00", end: "19:00" })
);

/** True when the schedule allows everything — nothing worth showing a client. */
export function isUnconstrained(schedule: WeeklySchedule): boolean {
  return schedule.every(
    (d) => d.open && d.start === "00:00" && d.end === "23:59"
  );
}

/** Monday-first weekday index (0 = Mon … 6 = Sun) of an ISO date, or -1. */
export function dayIndex(iso: string): number {
  const p = parseISO(iso);
  if (!p) return -1;
  const jsDay = new Date(p.year, p.month - 1, p.day).getDay(); // 0 = Sun
  return (jsDay + 6) % 7;
}

/** The day's rule, or null for an unparseable date. */
export function dayScheduleFor(
  schedule: WeeklySchedule,
  iso: string
): DaySchedule | null {
  const i = dayIndex(iso);
  return i < 0 ? null : schedule[i] ?? null;
}

/** Whether the driver works at all on that date. */
export function isDayOpen(schedule: WeeklySchedule, iso: string): boolean {
  return dayScheduleFor(schedule, iso)?.open ?? false;
}

/**
 * Whether a slot fits the schedule. A date with no time only needs the day to
 * be open — the exact hour is agreed later, as elsewhere in the booking flow.
 */
export function isWithinSchedule(
  schedule: WeeklySchedule,
  iso: string,
  time: string
): boolean {
  const day = dayScheduleFor(schedule, iso);
  if (!day || !day.open) return false;
  if (!TIME_RE.test(time)) return true;
  // Lexical compare is valid for zero-padded "HH:mm".
  return time >= day.start && time <= day.end;
}

/** "07:00 – 19:00", or "Fermé" when the driver does not work that day. */
export function formatDayWindow(day: DaySchedule | null): string {
  if (!day || !day.open) return "Fermé";
  return `${day.start} – ${day.end}`;
}

/** Coerce anything read back from storage into a usable schedule. */
export function sanitizeSchedule(raw: unknown): WeeklySchedule {
  if (!Array.isArray(raw) || raw.length !== 7) return cloneSchedule(DEFAULT_SCHEDULE);
  return raw.map((entry) => {
    const d = entry as Partial<DaySchedule> | null;
    const start = typeof d?.start === "string" && TIME_RE.test(d.start) ? d.start : "00:00";
    const end = typeof d?.end === "string" && TIME_RE.test(d.end) ? d.end : "23:59";
    return {
      open: d?.open !== false,
      start,
      // An end before its start would make the day unbookable without saying
      // so — treat it as "until the end of the day" instead.
      end: end >= start ? end : "23:59",
    };
  });
}

export function cloneSchedule(schedule: WeeklySchedule): WeeklySchedule {
  return schedule.map((d) => ({ ...d }));
}
