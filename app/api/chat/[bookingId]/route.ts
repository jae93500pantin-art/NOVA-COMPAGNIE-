import { NextRequest } from "next/server";
import { getBookingById } from "@/lib/bookingBroker";
import { listMessages, postMessage, subscribeChat, type ChatEvent } from "@/lib/chatBroker";
import {
  canSendMessage,
  chatStateForBooking,
  participantRole,
  MAX_CHAT_MESSAGE_LEN,
} from "@/lib/chat";
import { isValidRoom, sanitizeText, rateLimit } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Per-booking chat between a client and their driver.
 *  GET  → SSE stream (snapshot + message/closed events).
 *  POST → send a message.
 *
 * The thread only exists for a PAID booking, and only its two participants can
 * read or write it — a booking id alone is not enough.
 *
 * ⚠️ Demo-mode identity: like the bookings API, the sender id comes from the
 * request (localStorage client id / driver id) because there is no server-side
 * session yet. It is checked against the booking's own clientId/driverId, so a
 * stranger cannot join a thread, but a leaked client id would be enough to
 * impersonate. With Supabase configured, derive the identity from the session
 * cookie instead (see the `messages` RLS policies in supabase/schema.sql).
 */

/** Resolve + authorise a request. Returns the booking and the sender's role. */
function authorise(bookingId: string, senderId: string) {
  if (!isValidRoom(bookingId)) return { error: "Invalid booking", status: 400 } as const;
  const booking = getBookingById(bookingId);
  if (!booking) return { error: "Unknown booking", status: 404 } as const;
  const role = participantRole(booking, senderId);
  if (!role) return { error: "Not a participant", status: 403 } as const;
  if (chatStateForBooking(booking) === "locked") {
    return { error: "Chat not available yet", status: 409 } as const;
  }
  return { booking, role } as const;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { bookingId: string } }
) {
  const senderId = sanitizeText(req.nextUrl.searchParams.get("as"), 64);
  const auth = authorise(params.bookingId, senderId);
  if ("error" in auth) {
    return new Response(auth.error, { status: auth.status });
  }
  const bookingId = params.bookingId;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (e: ChatEvent | { type: "ping" }) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const unsub = subscribeChat(bookingId, send);
      const heartbeat = setInterval(() => send({ type: "ping" }), 15000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsub();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { bookingId: string } }
) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (!rateLimit(`chat:${ip}`, 30, 60_000).ok) {
    return Response.json({ error: "Too many messages" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const senderId = sanitizeText(body.senderId, 64);
  const auth = authorise(params.bookingId, senderId);
  if ("error" in auth) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Archived thread: history stays readable, but nothing new goes in.
  if (!canSendMessage(auth.booking)) {
    return Response.json({ error: "Chat closed" }, { status: 409 });
  }

  const text = sanitizeText(body.text, MAX_CHAT_MESSAGE_LEN);
  if (!text) {
    return Response.json({ error: "Empty message" }, { status: 400 });
  }

  const message = postMessage({
    bookingId: params.bookingId,
    role: auth.role,
    senderId,
    senderName: sanitizeText(body.senderName, 60),
    text,
  });

  return Response.json({ ok: true, message });
}

/** Current history + state, for clients that cannot hold an SSE connection. */
export async function HEAD(
  req: NextRequest,
  { params }: { params: { bookingId: string } }
) {
  const senderId = sanitizeText(req.nextUrl.searchParams.get("as"), 64);
  const auth = authorise(params.bookingId, senderId);
  if ("error" in auth) return new Response(null, { status: auth.status });
  return new Response(null, {
    status: 200,
    headers: { "X-Chat-Messages": String(listMessages(params.bookingId).length) },
  });
}
