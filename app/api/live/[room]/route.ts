import { NextRequest } from "next/server";
import {
  publish,
  subscribe,
  getHistory,
  roomPresence,
  type LiveMessage,
} from "@/lib/liveBroker";
import {
  isValidRoom,
  sanitizeText,
  rateLimit,
  MAX_MESSAGE_LEN,
  MAX_NAME_LEN,
  MAX_BODY_BYTES,
} from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET  → Server-Sent Events stream of messages for a room.
 * POST → Publish a message to a room.
 *
 * Powers the live PC ↔ phone demo conversation over the local network.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: { room: string } }
) {
  const room = params.room;
  if (!isValidRoom(room)) {
    return new Response("Invalid room", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const send = (event: string, data: unknown) =>
        safeEnqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      // Initial handshake: recent history + presence.
      send("history", getHistory(room));
      send("presence", { count: roomPresence(room) + 1 });

      const unsub = subscribe(room, (msg: LiveMessage) => send("message", msg));

      // Heartbeat keeps the connection alive through proxies.
      const heartbeat = setInterval(() => {
        safeEnqueue(`: ping\n\n`);
        send("presence", { count: roomPresence(room) });
      }, 15000);

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
  { params }: { params: { room: string } }
) {
  const room = params.room;
  if (!isValidRoom(room)) {
    return Response.json({ error: "Invalid room" }, { status: 400 });
  }

  // Rate limit per client IP + room (anti-flood / DoS).
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const rl = rateLimit(`live:${ip}:${room}`, 30, 10_000); // 30 msg / 10 s
  if (!rl.ok) {
    return Response.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  // Reject oversized bodies before parsing (DoS mitigation).
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return Response.json({ error: "Payload too large" }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const text = sanitizeText(payload.text, MAX_MESSAGE_LEN);
  const sender = sanitizeText(payload.sender, MAX_NAME_LEN) || "Invité";
  const senderId = sanitizeText(payload.senderId, 64);

  if (!text) {
    return Response.json({ error: "Empty message" }, { status: 400 });
  }
  if (!senderId) {
    return Response.json({ error: "Missing sender id" }, { status: 400 });
  }

  const message: LiveMessage = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    room,
    sender,
    senderId,
    text,
    ts: Date.now(),
  };

  publish(message);
  return Response.json({ ok: true });
}
