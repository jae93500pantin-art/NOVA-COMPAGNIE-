/**
 * In-memory store + pub/sub for booking chat threads (demo, server-side).
 *
 * One room per booking id. Messages live only in the Node process and are
 * broadcast over SSE so the client and the driver see them in real time on
 * different devices. Ephemeral by design (GDPR-friendly demo) — the persistent
 * version is the Supabase `messages` table in supabase/schema.sql.
 */

import {
  buildMessage,
  MAX_CHAT_HISTORY,
  type ChatMessage,
  type NewMessageInput,
} from "./chat";

type Event =
  | { type: "snapshot"; messages: ChatMessage[] }
  | { type: "message"; message: ChatMessage }
  | { type: "closed"; bookingId: string };

type Subscriber = (e: Event) => void;

interface Room {
  messages: ChatMessage[];
  subscribers: Set<Subscriber>;
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
    r = { messages: [], subscribers: new Set() };
    state.rooms.set(bookingId, r);
  }
  return r;
}

export function listMessages(bookingId: string): ChatMessage[] {
  return getRoom(bookingId).messages;
}

export function postMessage(input: NewMessageInput): ChatMessage {
  const room = getRoom(input.bookingId);
  const message = buildMessage(input);
  room.messages.push(message);
  // Bound the history so a long-lived process can't grow without limit.
  if (room.messages.length > MAX_CHAT_HISTORY) {
    room.messages.splice(0, room.messages.length - MAX_CHAT_HISTORY);
  }
  room.subscribers.forEach((fn) => safe(fn, { type: "message", message }));
  return message;
}

export function subscribeChat(bookingId: string, fn: Subscriber): () => void {
  const room = getRoom(bookingId);
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
