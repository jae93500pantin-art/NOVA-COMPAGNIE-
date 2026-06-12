/**
 * In-memory store + pub/sub for course bookings (demo, server-side).
 *
 * Mirrors lib/liveBroker.ts: bookings live only in the Node process and are
 * broadcast over SSE so a client and a driver on different devices see them in
 * real time. Ephemeral by design (GDPR-friendly demo). Persistent bookings are
 * the Supabase `bookings` table (schema.sql) for production.
 */

import {
  buildBooking,
  canTransition,
  type Booking,
  type BookingStatus,
  type NewBookingInput,
} from "./bookings";

type Event =
  | { type: "snapshot"; bookings: Booking[] }
  | { type: "booking"; booking: Booking }
  | { type: "status"; booking: Booking };

type Subscriber = (e: Event) => void;

interface Room {
  bookings: Booking[];
  subscribers: Set<Subscriber>;
}

interface State {
  rooms: Map<string, Room>;
}

const g = globalThis as unknown as { __bookingBroker?: State };
const state: State = g.__bookingBroker ?? { rooms: new Map() };
if (!g.__bookingBroker) g.__bookingBroker = state;

function getRoom(driverId: string): Room {
  let r = state.rooms.get(driverId);
  if (!r) {
    r = { bookings: [], subscribers: new Set() };
    state.rooms.set(driverId, r);
  }
  return r;
}

export function listBookings(driverId: string): Booking[] {
  return getRoom(driverId).bookings;
}

export function createBooking(input: NewBookingInput): Booking {
  const room = getRoom(input.driverId);
  const booking = buildBooking(input);
  room.bookings.push(booking);
  room.subscribers.forEach((fn) => safe(fn, { type: "booking", booking }));
  return booking;
}

export function updateBookingStatus(
  driverId: string,
  bookingId: string,
  status: BookingStatus
): Booking | null {
  const room = getRoom(driverId);
  const booking = room.bookings.find((b) => b.id === bookingId);
  if (!booking) return null;
  if (!canTransition(booking.status, status)) return null;
  booking.status = status;
  room.subscribers.forEach((fn) => safe(fn, { type: "status", booking }));
  return booking;
}

export function subscribeBookings(
  driverId: string,
  fn: Subscriber
): () => void {
  const room = getRoom(driverId);
  room.subscribers.add(fn);
  // Send the current snapshot immediately.
  safe(fn, { type: "snapshot", bookings: room.bookings });
  return () => {
    room.subscribers.delete(fn);
  };
}

function safe(fn: Subscriber, e: Event) {
  try {
    fn(e);
  } catch {
    /* ignore one broken subscriber */
  }
}

export type { Event as BookingEvent };
