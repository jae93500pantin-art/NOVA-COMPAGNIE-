/**
 * Store + pub/sub des fils de discussion, un par réservation.
 *
 * Comme pour les courses, la salle en mémoire reste la copie vive qui alimente
 * le SSE, mais elle n'est plus la seule : quand la persistance est configurée,
 * l'historique est relu depuis `public.messages` au premier accès puis écrit
 * au fil de l'eau. Un redémarrage ne fait plus disparaître la conversation
 * d'une course payée sous les yeux de ses deux participants.
 *
 * Sans clés de service, le comportement éphémère d'origine est conservé.
 */

import {
  buildMessage,
  MAX_CHAT_HISTORY,
  type ChatMessage,
  type NewMessageInput,
} from "./chat";
import type { Booking } from "./bookings";
import { insertMessage, isPersistenceEnabled, loadMessages } from "./persistence";

/** Les deux ids par lesquels l'interface reconnaît une partie de la course. */
type Parties = Pick<Booking, "clientId" | "driverId">;

type Event =
  | { type: "snapshot"; messages: ChatMessage[] }
  | { type: "message"; message: ChatMessage }
  | { type: "closed"; bookingId: string };

type Subscriber = (e: Event) => void;

interface Room {
  messages: ChatMessage[];
  subscribers: Set<Subscriber>;
  /** Historique relu depuis la base. Une seule fois : ce process est seul à écrire. */
  hydrated: boolean;
  hydrating?: Promise<void>;
}

interface State {
  rooms: Map<string, Room>;
}

const g = globalThis as unknown as { __chatBroker?: State };
const state: State = g.__chatBroker ?? { rooms: new Map() };
if (!g.__chatBroker) g.__chatBroker = state;

function getRoom(bookingId: string): Room {
  let r = state.rooms.get(bookingId);
  if (!r) {
    r = {
      messages: [],
      subscribers: new Set(),
      hydrated: !isPersistenceEnabled,
    };
    state.rooms.set(bookingId, r);
  }
  return r;
}

/**
 * Salle prête à être lue.
 *
 * Les parties de la course sont nécessaires pour relire l'historique : en base
 * un message porte le compte de son auteur, alors que l'interface raisonne sur
 * les deux ids de la réservation. La traduction se fait ici, une fois.
 */
async function ready(bookingId: string, parties: Parties): Promise<Room> {
  const room = getRoom(bookingId);
  if (room.hydrated) return room;
  if (!room.hydrating) {
    room.hydrating = (async () => {
      const stored = await loadMessages(bookingId, parties);
      const known = new Set(room.messages.map((m) => m.id));
      const merged = stored.filter((m) => !known.has(m.id)).concat(room.messages);
      room.messages = merged.slice(-MAX_CHAT_HISTORY);
      room.hydrated = true;
    })().finally(() => {
      room.hydrating = undefined;
    });
  }
  await room.hydrating;
  return room;
}

export async function listMessages(
  bookingId: string,
  parties: Parties
): Promise<ChatMessage[]> {
  return (await ready(bookingId, parties)).messages;
}

export async function postMessage(
  input: NewMessageInput,
  authorAccountId: string,
  parties: Parties
): Promise<ChatMessage> {
  const room = await ready(input.bookingId, parties);
  const draft = buildMessage(input);
  // Comme pour une course, l'identifiant vient de la base quand elle répond :
  // deux générateurs concurrents rendraient l'historique impossible à
  // dédoublonner à la relecture.
  const message = (await insertMessage(draft, authorAccountId, parties)) ?? draft;
  room.messages.push(message);
  // Bound the history so a long-lived process can't grow without limit.
  if (room.messages.length > MAX_CHAT_HISTORY) {
    room.messages.splice(0, room.messages.length - MAX_CHAT_HISTORY);
  }
  room.subscribers.forEach((fn) => safe(fn, { type: "message", message }));
  return message;
}

export async function subscribeChat(
  bookingId: string,
  parties: Parties,
  fn: Subscriber
): Promise<() => void> {
  const room = await ready(bookingId, parties);
  room.subscribers.add(fn);
  // Send the current history immediately.
  safe(fn, { type: "snapshot", messages: room.messages });
  return () => {
    room.subscribers.delete(fn);
  };
}

/**
 * Tell every open stream the ride is over so the UI flips to read-only without
 * a reload. History is kept (archived), not deleted.
 */
export function closeChat(bookingId: string): void {
  const room = state.rooms.get(bookingId);
  if (!room) return;
  room.subscribers.forEach((fn) => safe(fn, { type: "closed", bookingId }));
}

/** Drop a thread entirely (RGPD erasure of the booking). */
export function dropChat(bookingId: string): void {
  closeChat(bookingId);
  state.rooms.delete(bookingId);
}

function safe(fn: Subscriber, e: Event) {
  try {
    fn(e);
  } catch {
    /* ignore one broken subscriber */
  }
}

export type { Event as ChatEvent };
