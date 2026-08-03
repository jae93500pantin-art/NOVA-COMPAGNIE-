"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Send, Lock, Archive, Loader2 } from "lucide-react";
import type { Booking } from "@/lib/bookings";
import {
  chatStateForBooking,
  formatMessageTime,
  isSameSenderAsPrevious,
  MAX_CHAT_MESSAGE_LEN,
  type ChatMessage,
  type ChatRole,
} from "@/lib/chat";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  booking: Booking;
  /** Stable id of the viewer: their client id, or the driver id. */
  senderId: string;
  senderName: string;
  role: ChatRole;
}

/**
 * Chat thread scoped to one booking, live over SSE.
 * Rendered inline under a booking card. Writable only while the ride is paid
 * and not finished; read-only ("archived") once completed or cancelled.
 */
export function BookingChat({ booking, senderId, senderName, role }: Props) {
  const { t, lang } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [ready, setReady] = useState(false);
  const [forcedArchive, setForcedArchive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const state = forcedArchive ? "archived" : chatStateForBooking(booking);
  const open = state === "open";

  useEffect(() => {
    if (state === "locked" || !senderId) return;
    const es = new EventSource(
      `/api/chat/${booking.id}?as=${encodeURIComponent(senderId)}`
    );
    es.onmessage = (ev) => {
      try {
        const e = JSON.parse(ev.data);
        if (e.type === "snapshot") {
          setMessages(e.messages);
          setReady(true);
        } else if (e.type === "message") {
          setMessages((prev) =>
            prev.some((m) => m.id === e.message.id) ? prev : [...prev, e.message]
          );
        } else if (e.type === "closed") {
          setForcedArchive(true);
        }
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, [booking.id, senderId, state]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending || !open) return;
    setSending(true);
    setDraft("");
    try {
      const res = await fetch(`/api/chat/${booking.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderId, senderName, text }),
      });
      if (!res.ok) setDraft(text); // put it back so nothing is lost
    } catch {
      setDraft(text);
    } finally {
      setSending(false);
    }
  }, [draft, sending, open, booking.id, senderId, senderName]);

  if (state === "locked") {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-white/45">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        {t("chat.locked")}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
    >
      <div
        ref={scrollRef}
        className="max-h-72 space-y-1.5 overflow-y-auto px-4 py-4"
      >
        {!ready ? (
          <div className="grid place-items-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-white/30" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-white/35">
            {t("chat.empty")}
          </p>
        ) : (
          messages.map((m, i) => {
            const mine = m.senderId === senderId;
            const grouped = isSameSenderAsPrevious(messages, i);
            return (
              <div
                key={m.id}
                className={cn(
                  "flex flex-col",
                  mine ? "items-end" : "items-start",
                  grouped ? "mt-0.5" : "mt-3 first:mt-0"
                )}
              >
                {!grouped && (
                  <span className="mb-1 px-1 text-[11px] text-white/35">
                    {mine ? t("chat.you") : m.senderName}
                  </span>
                )}
                <div
                  className={cn(
                    "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm",
                    mine
                      ? "bg-royal-500/20 text-white"
                      : "bg-white/[0.07] text-white/90"
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  <span className="mt-1 block text-right text-[10px] text-white/35">
                    {formatMessageTime(m.createdAt, lang)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {open ? (
        <div className="flex items-end gap-2 border-t border-white/10 p-2.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_CHAT_MESSAGE_LEN))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder={t("chat.placeholder")}
            aria-label={t("chat.placeholder")}
            className="input max-h-28 min-h-[42px] flex-1 resize-none py-2.5"
          />
          <button
            onClick={() => void send()}
            disabled={!draft.trim() || sending}
            className="btn-primary h-[42px] w-[42px] shrink-0 !px-0"
            aria-label={t("chat.send")}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 border-t border-white/10 px-4 py-3 text-xs text-white/45">
          <Archive className="h-3.5 w-3.5 shrink-0" />
          {role === "driver" ? t("chat.archivedDriver") : t("chat.archived")}
        </div>
      )}
    </motion.div>
  );
}
