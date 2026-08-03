/**
 * Chat domain types + pure helpers (unit-testable, no I/O).
 *
 * A chat is scoped to ONE booking. It is not a general inbox: the thread only
 * exists because a specific ride exists, and it dies with it.
 */

import type { Booking, BookingStatus } from "./bookings";
import { shouldAutoComplete } from "./bookings";

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
}

export interface NewMessageInput {
  bookingId: string;
  role: ChatRole;
  senderId: string;
  senderName?: string;
  text: string;
}

export const MAX_CHAT_MESSAGE_LEN = 1000;
export const MAX_CHAT_HISTORY = 200;

/**
 * Lifecycle of the thread, derived from the booking status.
 *  - "locked"   → not available yet (ride not paid).
 *  - "open"     → both parties can write.
 *  - "archived" → read-only history (ride done or called off).
 */
export type ChatState = "locked" | "open" | "archived";

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
 */
export function chatStateForBooking(
  booking: Booking,
  now: number = Date.now()
): ChatState {
  if (shouldAutoComplete(booking, now)) return "archived";
  return chatStateFor(booking.status);
}

/** Whether new messages are accepted right now. */
export function canSendMessage(
  booking: Booking,
  now: number = Date.now()
): boolean {
  return chatStateForBooking(booking, now) === "open";
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

/** Build a fully-formed message from raw input (clamps + defaults). */
export function buildMessage(
  input: NewMessageInput,
  idFactory: () => string = defaultId,
  now: () => number = Date.now
): ChatMessage {
  return {
    id: idFactory(),
    bookingId: input.bookingId,
    role: input.role,
    senderId: input.senderId,
    senderName: input.senderName?.trim() || fallbackName(input.role),
    text: input.text.trim().slice(0, MAX_CHAT_MESSAGE_LEN),
    createdAt: now(),
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
