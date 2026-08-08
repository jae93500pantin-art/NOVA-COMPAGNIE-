/**
 * In-memory store for certified reviews (demo, server-side).
 *
 * One bucket per driver, like `bookingBroker`. Ephemeral by design — the
 * persistent version is the `public.reviews` table in supabase/schema.sql,
 * whose RLS enforces exactly the same "completed booking, once" rule.
 */

import "server-only";
import { buildReview, type CertifiedReview, type NewReviewInput } from "./reviews";

/** Newest first, capped so one driver cannot grow the process unbounded. */
const MAX_REVIEWS_PER_DRIVER = 200;

interface State {
  byDriver: Map<string, CertifiedReview[]>;
}

const g = globalThis as unknown as { __reviewBroker?: State };
const state: State = g.__reviewBroker ?? { byDriver: new Map() };
if (!g.__reviewBroker) g.__reviewBroker = state;

/** Published reviews for a driver, newest first. */
export function listReviews(driverId: string): CertifiedReview[] {
  return state.byDriver.get(driverId) ?? [];
}

/** Whether this ride has already been reviewed. */
export function hasReviewForBooking(
  driverId: string,
  bookingId: string
): boolean {
  return listReviews(driverId).some((r) => r.bookingId === bookingId);
}

export function addReview(input: NewReviewInput): CertifiedReview {
  const review = buildReview(input);
  const list = state.byDriver.get(input.driverId) ?? [];
  list.unshift(review);
  state.byDriver.set(input.driverId, list.slice(0, MAX_REVIEWS_PER_DRIVER));
  return review;
}

/** Test helper — drops everything for one driver. */
export function dropReviews(driverId: string): void {
  state.byDriver.delete(driverId);
}
