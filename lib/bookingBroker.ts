/**
 * In-memory store + pub/sub for course bookings (demo, server-side).
 *
 * Bookings live only in the Node process and are
 * broadcast over SSE so a client and a driver on different devices see them in
 * real time. Ephemeral by design (GDPR-friendly demo). Persistent bookings are
 * the Supabase `bookings` table (schema.sql) for production.
 */

import {
  buildBooking,
  canTransition,
  shouldAutoComplete,
  type Booking,
  type BookingStatus,
  type NewBookingInput,
} from "./bookings";
import { closeChat } from "./chatBroker";

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
  /** bookingId → booking, so the chat API can resolve a thread in O(1). */
  index: Map<string, Booking>;
}

const g = globalThis as unknown as { __bookingBroker?: State };
const state: State = g.__bookingBroker ?? { rooms: new Map(), index: new Map() };
if (!g.__bookingBroker) g.__bookingBroker = state;
// Older processes may hold a state object created before the index existed.
if (!state.index) state.index = new Map();

function getRoom(driverId: string): Room {
  let r = state.rooms.get(driverId);
  if (!r) {
    r = { bookings: [], subscribers: new Set() };
    state.rooms.set(driverId, r);
  }
  return r;
}

/**
 * Close paid rides nobody closed by hand (24 h safety net) and broadcast the
 * change. Runs on every read of a room, so the sweep needs no timer.
 */
function sweep(room: Room): void {
  const now = Date.now();
  room.bookings.forEach((b) => {
    if (!shouldAutoComplete(b, now)) return;
    b.status = "completed";
    closeChat(b.id);
    room.subscribers.forEach((fn) => safe(fn, { type: "status", booking: b }));
  });
}

export function listBookings(driverId: string): Booking[] {
  const room = getRoom(driverId);
  sweep(room);
  return room.bookings;
}

/** Resolve a booking from its id alone (used by the chat API to authorise). */
export function getBookingById(bookingId: string): Booking | null {
  return state.index.get(bookingId) ?? null;
}

export function createBooking(input: NewBookingInput): Booking {
  const room = getRoom(input.driverId);
  const booking = buildBooking(input);
  room.bookings.push(booking);
  state.index.set(booking.id, booking);
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
  // The ride is over: flip every open chat stream to read-only.
  if (status === "completed" || status === "cancelled") closeChat(booking.id);
  room.subscribers.forEach((fn) => safe(fn, { type: "status", booking }));
  return booking;
}

export function subscribeBookings(
  driverId: string,
  fn: Subscriber
): () => void {
  const room = getRoom(driverId);
  sweep(room);
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
