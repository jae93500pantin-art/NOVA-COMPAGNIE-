import { NextRequest } from "next/server";
import { getBookingById } from "@/lib/bookingBroker";
import { listMessages, postMessage, subscribeChat, type ChatEvent } from "@/lib/chatBroker";
import {
  canSendMessage,
  chatStateForBooking,
  participantRole,
  MAX_CHAT_MESSAGE_LEN,
} from "@/lib/chat";
import { bookingActor } from "@/lib/bookings";
import { getDriver } from "@/lib/drivers";
import { getServerUser } from "@/lib/session";
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
 * L'identité vient de la **session** (`getServerUser`), jamais de la requête :
 * l'id de l'expéditeur circulait dans l'URL (`?as=`) et dans le corps du POST,
 * si bien qu'un id de client capturé — dans un journal, un partage d'écran, un
 * en-tête `Referer` — suffisait à lire et écrire dans la conversation d'un
 * autre. Le contrôle de participation ne valait que ce que valait cet id.
 *
 * ⚠️ Mode démo (aucune clé Supabase) : le serveur ne voit aucune session, on
 * retombe sur l'id de navigateur comme avant plutôt que de bloquer la
 * démonstration. Le chemin de production est déjà en base : les policies RLS
 * de `messages` (supabase/schema.sql) appliquent exactement les mêmes règles.
 */

/** Nom public du chauffeur, tel que l'affiche déjà `DriverRequests`. */
function driverDisplayName(driverId: string): string {
  const driver = getDriver(driverId);
  return driver ? `${driver.firstName} ${driver.lastName}`.trim() : "";
}

/** Resolve + authorise a request. Returns the booking and the sender's role. */
async function authorise(bookingId: string, claimedSenderId: string) {
  if (!isValidRoom(bookingId)) return { error: "Invalid booking", status: 400 } as const;
  const booking = getBookingById(bookingId);
  if (!booking) return { error: "Unknown booking", status: 404 } as const;

  const session = await getServerUser();
  if (session.state === "anonymous") {
    return { error: "Authentification requise", status: 401 } as const;
  }

  // `bookingActor` est la même définition de « qui est cette personne pour
  // cette réservation » que celle qui autorise les changements de statut : un
  // chauffeur y est reconnu par le profil public qu'il pilote (`driver_slug`),
  // pas par son id de compte.
  const role =
    session.state === "ok"
      ? (() => {
          const actor = bookingActor(
            booking,
            session.user.id,
            session.user.driverSlug
          );
          return actor === "stranger" ? null : actor;
        })()
      : participantRole(booking, claimedSenderId);

  if (!role) return { error: "Not a participant", status: 403 } as const;
  if (chatStateForBooking(booking) === "locked") {
    return { error: "Chat not available yet", status: 409 } as const;
  }

  // L'id écrit sur le message vient de la réservation, pas de l'appelant : il
  // ne peut donc pas diverger de celui que l'interface compare pour distinguer
  // ses propres bulles.
  const senderId = role === "client" ? booking.clientId : booking.driverId;
  return { booking, role, senderId, session } as const;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { bookingId: string } }
) {
  const senderId = sanitizeText(req.nextUrl.searchParams.get("as"), 64);
  const auth = await authorise(params.bookingId, senderId);
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
  const auth = await authorise(params.bookingId, senderId);
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

  // Le nom affiché suit la même règle que l'id : tant qu'une session existe il
  // vient d'elle, sinon un participant légitime pourrait signer ses messages
  // « Support Nova » dans sa propre conversation.
  const claimedName = sanitizeText(body.senderName, 60);
  const senderName =
    auth.session.state === "ok"
      ? auth.role === "driver"
        ? driverDisplayName(auth.booking.driverId) || claimedName
        : `${auth.session.user.firstName} ${auth.session.user.lastName}`.trim() ||
          auth.booking.clientName ||
          claimedName
      : claimedName;

  const message = postMessage({
    bookingId: params.bookingId,
    role: auth.role,
    senderId: auth.senderId,
    senderName,
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
  const auth = await authorise(params.bookingId, senderId);
  if ("error" in auth) return new Response(null, { status: auth.status });
  return new Response(null, {
    status: 200,
    headers: { "X-Chat-Messages": String(listMessages(params.bookingId).length) },
  });
}
