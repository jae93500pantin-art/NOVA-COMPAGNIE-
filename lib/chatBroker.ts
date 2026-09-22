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
 *
 * ## Accusés de remise et de lecture
 *
 * Les abonnés sont indexés **par rôle**, et pas seulement comptés : c'est ce
 * qui permet de dire « remis » en le sachant. Un message est remis quand le
 * destinataire — l'autre rôle — a un flux ouvert, soit au moment de l'envoi,
 * soit à sa prochaine connexion. Il est lu quand ce destinataire ouvre
 * réellement le fil (`markRead`).
 *
 * ⚠️ Ne jamais poser ces deux marqueurs à l'envoi « pour faire joli ». Un
 * double check affiché sans savoir fait attendre une réponse que personne n'a
 * reçue — et c'est exactement le moment où un client descend chercher une
 * voiture qui n'est pas là.
 */

import {
  buildMessage,
  MAX_CHAT_HISTORY,
  type ChatMessage,
  type ChatRole,
  type NewMessageInput,
} from "./chat";
import type { Booking } from "./bookings";
import {
  insertMessage,
  isPersistenceEnabled,
  loadMessages,
  markMessagesDelivered,
  markMessagesRead,
} from "./persistence";

/** Les deux ids par lesquels l'interface reconnaît une partie de la course. */
type Parties = Pick<Booking, "clientId" | "driverId">;

type Event =
  | { type: "snapshot"; messages: ChatMessage[] }
  | { type: "message"; message: ChatMessage }
  /**
   * Accusés posés sur les messages écrits par `for`. Le destinataire est donc
   * l'autre rôle — c'est lui qui vient de les recevoir ou de les lire.
   */
  | { type: "receipts"; for: ChatRole; deliveredAt?: number; readAt?: number }
  /** La course est close : `closesAt` est la fin du délai de grâce. */
  | { type: "closed"; bookingId: string; closesAt: number };

type Subscriber = (e: Event) => void;

interface Room {
  messages: ChatMessage[];
  /** Le rôle est la valeur, pas une simple présence : voir l'en-tête. */
  subscribers: Map<Subscriber, ChatRole | null>;
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
      subscribers: new Map(),
      hydrated: !isPersistenceEnabled,
    };
    state.rooms.set(bookingId, r);
  }
  return r;
}

const other = (role: ChatRole): ChatRole =>
  role === "client" ? "driver" : "client";

/** Un participant de ce rôle a-t-il un flux ouvert en ce moment ? */
function isWatching(room: Room, role: ChatRole): boolean {
  for (const r of room.subscribers.values()) if (r === role) return true;
  return false;
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
  const stored = (await insertMessage(draft, authorAccountId, parties)) ?? draft;
  // Le texte diffusé est celui de `buildMessage`, donc déjà masqué : le
  // trigger SQL applique la même règle sur la copie écrite.
  const recipientWatching = isWatching(room, other(input.role));
  const message: ChatMessage = recipientWatching
    ? { ...stored, deliveredAt: Date.now() }
    : stored;
  room.messages.push(message);
  // Bound the history so a long-lived process can't grow without limit.
  if (room.messages.length > MAX_CHAT_HISTORY) {
    room.messages.splice(0, room.messages.length - MAX_CHAT_HISTORY);
  }
  room.subscribers.forEach((_role, fn) => safe(fn, { type: "message", message }));
  if (message.deliveredAt) {
    void markMessagesDelivered(
      input.bookingId,
      other(input.role),
      message.deliveredAt
    );
  }
  return message;
}

/**
 * Le destinataire a ouvert le fil : tout ce que l'autre partie a écrit devient
 * « lu ». Rien n'est marqué côté lecteur — on ne se lit pas soi-même.
 */
export async function markRead(
  bookingId: string,
  parties: Parties,
  readerRole: ChatRole,
  now: number = Date.now()
): Promise<void> {
  const room = await ready(bookingId, parties);
  const target = other(readerRole);
  let touched = false;
  for (const m of room.messages) {
    if (m.role !== target || m.readAt) continue;
    m.readAt = now;
    m.deliveredAt = m.deliveredAt ?? now;
    touched = true;
  }
  if (!touched) return;
  room.subscribers.forEach((_role, fn) =>
    safe(fn, { type: "receipts", for: target, deliveredAt: now, readAt: now })
  );
  void markMessagesRead(bookingId, readerRole, now);
}

export async function subscribeChat(
  bookingId: string,
  parties: Parties,
  fn: Subscriber,
  role: ChatRole | null = null
): Promise<() => void> {
  const room = await ready(bookingId, parties);
  room.subscribers.set(fn, role);
  // Send the current history immediately.
  safe(fn, { type: "snapshot", messages: room.messages });
  // Ce participant reprend son flux : ce qui l'attendait lui est remis.
  if (role) void deliverPending(bookingId, room, role);
  return () => {
    room.subscribers.delete(fn);
  };
}

/** Marque comme remis les messages qui attendaient ce destinataire. */
async function deliverPending(
  bookingId: string,
  room: Room,
  recipientRole: ChatRole
): Promise<void> {
  const now = Date.now();
  const target = other(recipientRole);
  let touched = false;
  for (const m of room.messages) {
    if (m.role !== target || m.deliveredAt) continue;
    m.deliveredAt = now;
    touched = true;
  }
  if (!touched) return;
  room.subscribers.forEach((_role, fn) =>
    safe(fn, { type: "receipts", for: target, deliveredAt: now })
  );
  void markMessagesDelivered(bookingId, recipientRole, now);
}

/**
 * La course est close. Le fil n'est PAS coupé sur-le-champ : l'événement porte
 * la fin du délai de grâce (`lib/chat.ts`), et les interfaces ouvertes
 * affichent le compte à rebours avant de passer en lecture seule.
 * L'historique est conservé (archivé), jamais supprimé.
 */
export function closeChat(bookingId: string, closesAt: number): void {
  const room = state.rooms.get(bookingId);
  if (!room) return;
  room.subscribers.forEach((_role, fn) =>
    safe(fn, { type: "closed", bookingId, closesAt })
  );
}

/** Drop a thread entirely (RGPD erasure of the booking). */
export function dropChat(bookingId: string): void {
  closeChat(bookingId, Date.now());
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
