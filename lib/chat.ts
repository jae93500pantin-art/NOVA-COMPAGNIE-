/**
 * Chat domain types + pure helpers (unit-testable, no I/O).
 *
 * A chat is scoped to ONE booking. It is not a general inbox: the thread only
 * exists because a specific ride exists, and it dies with it.
 */

import type { Booking, BookingStatus } from "./bookings";
import { shouldAutoComplete } from "./bookings";
import { maskContacts } from "./chatMasking";

export type ChatRole = "client" | "driver";

export interface ChatMessage {
  id: string;
  bookingId: string;
  role: ChatRole;
  /** Stable sender id: the client id, or the driver id. */
  senderId: string;
  senderName: string;
  text: string;
  createdAt: number;
  /** Envoye d'un seul geste depuis les reponses rapides. */
  isQuickReply?: boolean;
  /** Le destinataire avait un flux ouvert : le message lui est parvenu. */
  deliveredAt?: number;
  /** Le destinataire a ouvert le fil apres ce message. */
  readAt?: number;
  /** Des coordonnees ont ete retirees du texte a l'ecriture. */
  masked?: boolean;
}

export interface NewMessageInput {
  bookingId: string;
  role: ChatRole;
  senderId: string;
  senderName?: string;
  text: string;
  isQuickReply?: boolean;
}

/**
 * Accuses visibles a cote d'une bulle envoyee.
 *
 * ⚠️ Aucun des trois n'est declaratif : « remis » veut dire que le
 * destinataire avait reellement un flux ouvert, « lu » qu'il a ouvert le fil
 * ensuite. Un indicateur affiche sans le savoir est pire que pas
 * d'indicateur — il fait attendre une reponse qui n'arrivera pas.
 */
export type DeliveryStatus = "sent" | "delivered" | "read";

export function messageDeliveryStatus(m: ChatMessage): DeliveryStatus {
  if (m.readAt) return "read";
  if (m.deliveredAt) return "delivered";
  return "sent";
}

export const MAX_CHAT_MESSAGE_LEN = 1000;
export const MAX_CHAT_HISTORY = 200;

/**
 * Lifecycle of the thread, derived from the booking status.
 *  - "locked"   → not available yet (ride not paid).
 *  - "open"     → both parties can write.
 *  - "grace"    → ride closed, still writable for 30 min (see below).
 *  - "archived" → read-only history.
 */
export type ChatState = "locked" | "open" | "grace" | "archived";

/**
 * Delai pendant lequel la conversation reste ouverte APRES la cloture de la
 * course. Objet oublie, facture, porte du hall : l'essentiel de ce qui se dit
 * entre un client et son chauffeur se dit juste apres la descente du vehicule.
 * Couper le fil a la seconde ou le chauffeur cloture renvoyait ces echanges
 * vers WhatsApp, c'est-a-dire hors de la plateforme.
 */
export const CHAT_GRACE_AFTER_CLOSE_MS = 30 * 60 * 1000;

export function chatStateFor(status: BookingStatus): ChatState {
  switch (status) {
    case "paid":
      return "open";
    case "completed":
    case "cancelled":
      return "archived";
    default:
      // pending / confirmed / refused — no thread before the ride is paid.
      return "locked";
  }
}

/**
 * Chat state for a live booking, honouring the 24 h auto-close safety net:
 * a paid ride that is long past reads as archived even if nobody closed it.
 *
 * ⚠️ Une course cloturee n'est pas archivee sur-le-champ : elle passe par
 * l'etat « grace », encore inscriptible, pendant CHAT_GRACE_AFTER_CLOSE_MS.
 * Une reservation anterieure a cette regle n'a pas de closedAt — elle retombe
 * alors sur l'archivage immediat d'origine, plutot que de rouvrir un fil que
 * ses deux participants croyaient clos depuis des semaines.
 */
export function chatStateForBooking(
  booking: Booking,
  now: number = Date.now()
): ChatState {
  if (shouldAutoComplete(booking, now)) return "archived";
  const base = chatStateFor(booking.status);
  if (base !== "archived") return base;
  const until = chatClosesAt(booking);
  return until !== null && now < until ? "grace" : "archived";
}

/**
 * Instant du verrouillage definitif, ou null si la course n'est pas cloturee
 * (le fil n'a pas d'echeance) ou si sa cloture est anterieure a cette regle.
 */
export function chatClosesAt(booking: Booking): number | null {
  if (booking.status !== "completed" && booking.status !== "cancelled") {
    return null;
  }
  return booking.closedAt ? booking.closedAt + CHAT_GRACE_AFTER_CLOSE_MS : null;
}

/** Minutes restantes avant le verrouillage (0 si aucune echeance en cours). */
export function graceMinutesLeft(
  booking: Booking,
  now: number = Date.now()
): number {
  const until = chatClosesAt(booking);
  if (until === null || now >= until) return 0;
  return Math.max(1, Math.ceil((until - now) / 60_000));
}

/** Whether new messages are accepted right now. */
export function canSendMessage(
  booking: Booking,
  now: number = Date.now()
): boolean {
  const state = chatStateForBooking(booking, now);
  return state === "open" || state === "grace";
}

/**
 * Whether a sender is a participant of this booking's thread.
 * Third parties can neither read nor write, whatever id they claim.
 */
export function participantRole(
  booking: Booking,
  senderId: string
): ChatRole | null {
  if (!senderId) return null;
  if (senderId === booking.clientId) return "client";
  if (senderId === booking.driverId) return "driver";
  return null;
}

/**
 * Build a fully-formed message from raw input (clamps + defaults).
 *
 * ⚠️ **Le masquage des coordonnees a lieu ici**, et pas seulement dans le
 * trigger SQL. C'est le seul point par lequel passent a la fois la copie
 * diffusee en temps reel et la copie ecrite en base : masquer uniquement a
 * l'insertion laisserait le destinataire recevoir le numero en clair par le
 * flux, la base gardant une trace propre d'un echange qui ne l'etait pas.
 */
export function buildMessage(
  input: NewMessageInput,
  idFactory: () => string = defaultId,
  now: () => number = Date.now
): ChatMessage {
  const { text, masked } = maskContacts(
    input.text.trim().slice(0, MAX_CHAT_MESSAGE_LEN)
  );
  return {
    id: idFactory(),
    bookingId: input.bookingId,
    role: input.role,
    senderId: input.senderId,
    senderName: input.senderName?.trim() || fallbackName(input.role),
    text,
    createdAt: now(),
    isQuickReply: input.isQuickReply === true,
    masked,
  };
}

function fallbackName(role: ChatRole): string {
  return role === "driver" ? "Chauffeur" : "Client";
}

function defaultId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** "14:32" — short timestamp shown next to each bubble. */
export function formatMessageTime(
  createdAt: number,
  lang: "fr" | "en" = "fr"
): string {
  const d = new Date(createdAt);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (lang === "en") {
    const h12 = d.getHours() % 12 || 12;
    const suffix = d.getHours() < 12 ? "AM" : "PM";
    return `${h12}:${mm} ${suffix}`;
  }
  return `${hh}:${mm}`;
}

/** Group consecutive messages from the same sender (tighter bubble stacks). */
export function isSameSenderAsPrevious(
  messages: ChatMessage[],
  index: number
): boolean {
  if (index <= 0) return false;
  return messages[index - 1].senderId === messages[index].senderId;
}
