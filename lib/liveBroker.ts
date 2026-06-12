/**
 * In-memory publish/subscribe broker for the local live-chat demo.
 *
 * Runs inside the Next.js Node.js server process and lets two devices on the
 * same network (e.g. a PC and an iPhone) exchange messages in real time via
 * Server-Sent Events — with zero external services.
 *
 * Privacy by design (GDPR): messages live only in process memory, are never
 * written to disk or a database, and a room is fully purged once empty. They
 * are ephemeral by construction.
 *
 * NOTE: This is for local demos. In production, real conversations are backed
 * by Supabase Realtime (see lib/realtime.ts) with row-level security.
 */

export interface LiveMessage {
  id: string;
  room: string;
  sender: string;
  /** Stable per-tab id so a client can tell its own messages apart. */
  senderId: string;
  text: string;
  ts: number;
}

type Subscriber = (msg: LiveMessage) => void;

interface Room {
  subscribers: Set<Subscriber>;
  /** Small ring buffer so a late joiner sees recent context. */
  history: LiveMessage[];
}

interface BrokerState {
  rooms: Map<string, Room>;
}

// Persist across HMR reloads in dev by stashing on globalThis.
const globalForBroker = globalThis as unknown as { __liveBroker?: BrokerState };

const state: BrokerState =
  globalForBroker.__liveBroker ?? { rooms: new Map() };

if (!globalForBroker.__liveBroker) {
  globalForBroker.__liveBroker = state;
}

const HISTORY_LIMIT = 50;

function getRoom(room: string): Room {
  let r = state.rooms.get(room);
  if (!r) {
    r = { subscribers: new Set(), history: [] };
    state.rooms.set(room, r);
  }
  return r;
}

export function subscribe(room: string, fn: Subscriber): () => void {
  const r = getRoom(room);
  r.subscribers.add(fn);
  return () => {
    r.subscribers.delete(fn);
    // Purge empty rooms so nothing lingers in memory.
    if (r.subscribers.size === 0) {
      state.rooms.delete(room);
    }
  };
}

export function getHistory(room: string): LiveMessage[] {
  return state.rooms.get(room)?.history ?? [];
}

export function publish(message: LiveMessage): void {
  const r = getRoom(message.room);
  r.history.push(message);
  if (r.history.length > HISTORY_LIMIT) {
    r.history.splice(0, r.history.length - HISTORY_LIMIT);
  }
  r.subscribers.forEach((fn) => {
    try {
      fn(message);
    } catch {
      // Ignore a single broken subscriber.
    }
  });
}

export function roomPresence(room: string): number {
  return state.rooms.get(room)?.subscribers.size ?? 0;
}
