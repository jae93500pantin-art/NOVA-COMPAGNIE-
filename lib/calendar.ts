/**
 * Pure calendar helpers for the premium date picker (unit-testable, no DOM).
 * All dates are handled as local "YYYY-MM-DD" strings to avoid timezone drift.
 */

export interface DayCell {
  /** "YYYY-MM-DD" or "" for padding cells before the 1st of the month. */
  iso: string;
  /** Day number (1-31), or 0 for padding. */
  day: number;
  /** In the displayed month (vs leading/trailing padding). */
  inMonth: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Build "YYYY-MM-DD" from parts (month is 1-based). */
export function toISO(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Parse "YYYY-MM-DD" → {year, month(1-based), day} or null. */
export function parseISO(
  iso: string
): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const year = +m[1];
  const month = +m[2];
  const day = +m[3];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** Number of days in a given month (1-based month). */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Weekday index of the 1st of the month, Monday-first (0 = Mon … 6 = Sun).
 * The picker is Monday-first (FR/EU convention).
 */
export function firstWeekdayMondayFirst(year: number, month: number): number {
  const jsDay = new Date(year, month - 1, 1).getDay(); // 0 = Sun
  return (jsDay + 6) % 7;
}

/**
 * 6-row × 7-col grid (42 cells) for a month, with leading/trailing padding.
 * Stable length keeps the calendar height fixed (no layout jump).
 */
export function monthGrid(year: number, month: number): DayCell[] {
  const lead = firstWeekdayMondayFirst(year, month);
  const total = daysInMonth(year, month);
  const cells: DayCell[] = [];
  for (let i = 0; i < lead; i++) cells.push({ iso: "", day: 0, inMonth: false });
  for (let d = 1; d <= total; d++) {
    cells.push({ iso: toISO(year, month, d), day: d, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ iso: "", day: 0, inMonth: false });
  }
  // Always pad to 6 full rows (42) for a constant height.
  while (cells.length < 42) {
    cells.push({ iso: "", day: 0, inMonth: false });
  }
  return cells;
}

/** Move (year, month) by ±1 month, rolling the year over. */
export function shiftMonth(
  year: number,
  month: number,
  delta: number
): { year: number; month: number } {
  const idx = (year * 12 + (month - 1) + delta);
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/** True when iso is strictly before the `min` ISO date (a → disabled). */
export function isBefore(iso: string, minISO: string): boolean {
  if (!iso || !minISO) return false;
  return iso < minISO; // lexical compare is valid for YYYY-MM-DD
}

/** Add `days` to an ISO date, returning a new ISO date. */
export function addDays(iso: string, days: number): string {
  const p = parseISO(iso);
  if (!p) return iso;
  const d = new Date(p.year, p.month - 1, p.day + days);
  return toISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/**
 * ISO date of the upcoming Saturday (this weekend) relative to `fromISO`.
 * If already Saturday/Sunday, returns the current/again upcoming Saturday.
 */
export function nextWeekendISO(fromISO: string): string {
  const p = parseISO(fromISO);
  if (!p) return fromISO;
  const jsDay = new Date(p.year, p.month - 1, p.day).getDay(); // 0 Sun … 6 Sat
  // Days until Saturday (6). If Sunday (0), this weekend already started → today.
  if (jsDay === 0 || jsDay === 6) return fromISO;
  const delta = 6 - jsDay;
  return addDays(fromISO, delta);
}
