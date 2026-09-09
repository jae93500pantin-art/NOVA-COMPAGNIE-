/**
 * Store + pub/sub des réservations, côté serveur.
 *
 * La salle en mémoire reste la copie vive : c'est elle qui alimente le SSE et
 * qui permet à un client et à un chauffeur, sur deux appareils, de voir la même
 * course changer d'état en temps réel.
 *
 * Ce qui a changé : elle n'est plus la seule copie. Quand la persistance est
 * configurée (`lib/persistence.ts`), chaque salle est **relue depuis Postgres
 * au premier accès** puis tenue à jour en écriture immédiate. Un redémarrage
 * du process n'efface donc plus les réservations — il vidait auparavant tout
 * l'historique d'un client, ses fils de discussion et ses avis avec.
 *
 * ⚠️ Le temps réel, lui, ne traverse pas le process : deux serveurs ne se
 * verraient pas l'un l'autre. C'est assumé tant que le déploiement est une VM
 * avec un seul process ; le jour venu, c'est Supabase Realtime qui remplacera
 * ce pub/sub, pas la persistance.
 *
 * Sans clés de service, rien de tout cela ne s'active et le comportement
 * éphémère d'origine est conservé — la démo sans configuration continue de
 * fonctionner seule.
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
import {
  insertBooking,
  isPersistenceEnabled,
  loadBooking,
  loadDriverBookings,
  persistBookingStatus,
} from "./persistence";

type Event =
  | { type: "snapshot"; bookings: Booking[] }
  | { type: "booking"; booking: Booking }
  | { type: "status"; booking: Booking };

type Subscriber = (e: Event) => void;

interface Room {
  bookings: Booking[];
  subscribers: Set<Subscriber>;
  /**
   * Relecture faite. Une salle n'est rechargée qu'une fois : ce process est le
   * seul à écrire, sa copie mémoire ne peut donc pas prendre du retard.
   */
  hydrated: boolean;
  /** Relecture en cours, partagée pour que deux requêtes simultanées n'en lancent pas deux. */
  hydrating?: Promise<void>;
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
    r = { bookings: [], subscribers: new Set(), hydrated: !isPersistenceEnabled };
    state.rooms.set(driverId, r);
  }
  return r;
}

/** Salle prête à être lue : relue depuis la base au premier accès. */
async function ready(driverId: string): Promise<Room> {
  const room = getRoom(driverId);
  if (room.hydrated) return room;
  // Deux requêtes concurrentes sur une salle froide partagent la même lecture,
  // sans quoi la seconde dupliquerait tout l'historique dans la copie mémoire.
  if (!room.hydrating) {
    room.hydrating = (async () => {
      const stored = await loadDriverBookings(driverId);
      const known = new Set(room.bookings.map((b) => b.id));
      stored.forEach((b) => {
        if (known.has(b.id)) return;
        room.bookings.push(b);
        state.index.set(b.id, b);
      });
      room.bookings.sort((a, b) => a.createdAt - b.createdAt);
      room.hydrated = true;
    })().finally(() => {
      room.hydrating = undefined;
    });
  }
  await room.hydrating;
  return room;
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
    void persistBookingStatus(b.id, "completed");
    closeChat(b.id);
    room.subscribers.forEach((fn) => safe(fn, { type: "status", booking: b }));
  });
}

export async function listBookings(driverId: string): Promise<Booking[]> {
  const room = await ready(driverId);
  sweep(room);
  return room.bookings;
}

/** Resolve a booking from its id alone (used by the chat API to authorise). */
export async function getBookingById(bookingId: string): Promise<Booking | null> {
  const known = state.index.get(bookingId);
  if (known) return known;
  // Le fil de discussion ou l'avis peut arriver sur un process qui n'a pas
  // encore chargé la salle du chauffeur : on résout la course seule.
  const stored = await loadBooking(bookingId);
  if (!stored) return null;
  state.index.set(stored.id, stored);
  const room = getRoom(stored.driverId);
  if (!room.bookings.some((b) => b.id === stored.id)) room.bookings.push(stored);
  return stored;
}

export async function createBooking(input: NewBookingInput): Promise<Booking> {
  const room = await ready(input.driverId);
  const draft = buildBooking(input);
  // La base fait autorité sur l'identifiant : c'est par lui que le chat et les
  // avis se rattachent à la course, il ne peut pas différer d'une copie à
  // l'autre. Si l'écriture échoue, on garde l'id local plutôt que de perdre la
  // demande.
  const booking = (await insertBooking(draft)) ?? draft;
  room.bookings.push(booking);
  state.index.set(booking.id, booking);
  room.subscribers.forEach((fn) => safe(fn, { type: "booking", booking }));
  return booking;
}

export async function updateBookingStatus(
  driverId: string,
  bookingId: string,
  status: BookingStatus
): Promise<Booking | null> {
  const room = await ready(driverId);
  const booking = room.bookings.find((b) => b.id === bookingId);
  if (!booking) return null;
  if (!canTransition(booking.status, status)) return null;
  booking.status = status;
  await persistBookingStatus(booking.id, status);
  // The ride is over: flip every open chat stream to read-only.
  if (status === "completed" || status === "cancelled") closeChat(booking.id);
  room.subscribers.forEach((fn) => safe(fn, { type: "status", booking }));
  return booking;
}

export async function subscribeBookings(
  driverId: string,
  fn: Subscriber
): Promise<() => void> {
  const room = await ready(driverId);
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
