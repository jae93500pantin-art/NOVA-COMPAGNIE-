"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Send,
  Phone,
  Video,
  MoreVertical,
  CheckCheck,
  ChevronLeft,
  Paperclip,
  Smile,
} from "lucide-react";
import { conversations as seed } from "@/lib/conversations";
import { getDriver } from "@/lib/drivers";
import type { ChatMessage, Conversation } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ChatInterface() {
  const [convos, setConvos] = useState<Conversation[]>(seed);
  const [activeId, setActiveId] = useState(seed[0]?.id ?? "");
  const [draft, setDraft] = useState("");
  const [showThread, setShowThread] = useState(false); // mobile

  const active = convos.find((c) => c.id === activeId);
  const driver = active ? getDriver(active.driverId) : undefined;

  const send = () => {
    if (!draft.trim() || !active) return;
    const msg: ChatMessage = {
      id: `m${Date.now()}`,
      fromMe: true,
      text: draft.trim(),
      time: new Date().toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      read: false,
    };
    setConvos((prev) =>
      prev.map((c) =>
        c.id === active.id
          ? { ...c, messages: [...c.messages, msg], lastMessage: msg.text, time: msg.time }
          : c
      )
    );
    setDraft("");

    // Simulate a reply
    setTimeout(() => {
      const reply: ChatMessage = {
        id: `r${Date.now()}`,
        fromMe: false,
        text: "Bien reçu, je m'occupe de tout. À très vite !",
        time: new Date().toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setConvos((prev) =>
        prev.map((c) =>
          c.id === active.id
            ? { ...c, messages: [...c.messages, reply], lastMessage: reply.text }
            : c
        )
      );
    }, 1400);
  };

  const openConvo = (id: string) => {
    setActiveId(id);
    setShowThread(true);
    setConvos((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c))
    );
  };

  return (
    <div className="grid h-[calc(100dvh-7rem)] overflow-hidden border-y border-white/10 sm:h-[calc(100dvh-9rem)] sm:rounded-3xl sm:border glass-strong md:grid-cols-[340px_1fr]">
      {/* Conversation list */}
      <aside
        className={cn(
          "flex flex-col border-r border-white/10",
          showThread ? "hidden md:flex" : "flex"
        )}
      >
        <div className="border-b border-white/10 p-4">
          <h2 className="text-lg font-semibold text-white">Messages</h2>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input placeholder="Rechercher…" className="input pl-9" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scroll-touch p-2">
          {convos.map((c) => {
            const d = getDriver(c.driverId);
            if (!d) return null;
            return (
              <button
                key={c.id}
                onClick={() => openConvo(c.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl p-3 text-left transition",
                  c.id === activeId && !showThread
                    ? "bg-white/[0.06]"
                    : "hover:bg-white/[0.03]",
                  c.id === activeId && "md:bg-white/[0.06]"
                )}
              >
                <div className="relative shrink-0">
                  <Image
                    src={d.avatar}
                    alt={d.firstName}
                    width={48}
                    height={48}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                  {d.available && (
                    <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-ink-900 bg-emerald-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                      {d.firstName} {d.lastName}
                    </p>
                    <span className="shrink-0 text-[11px] text-white/40">
                      {c.time}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-xs text-white/50">
                      {c.lastMessage}
                    </p>
                    {c.unread > 0 && (
                      <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-royal-500 px-1.5 text-[10px] font-semibold text-white">
                        {c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Thread */}
      <section
        className={cn(
          "flex flex-col",
          showThread ? "flex" : "hidden md:flex"
        )}
      >
        {active && driver ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowThread(false)}
                  className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/5 md:hidden"
                >
                  <ChevronLeft className="h-5 w-5 text-white" />
                </button>
                <Link href={`/drivers/${driver.id}`}>
                  <Image
                    src={driver.avatar}
                    alt={driver.firstName}
                    width={42}
                    height={42}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                </Link>
                <div>
                  <p className="text-sm font-semibold text-white">
                    {driver.firstName} {driver.lastName}
                  </p>
                  <p className="text-xs text-emerald-400">
                    {driver.available ? "En ligne" : "Hors ligne"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {[Phone, Video, MoreVertical].map((Icon, i) => (
                  <button
                    key={i}
                    className="grid h-9 w-9 place-items-center rounded-full text-white/60 transition hover:bg-white/5 hover:text-white"
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 space-y-3 overflow-y-auto scroll-touch bg-[radial-gradient(circle_at_50%_0%,rgba(47,99,255,0.06),transparent_40%)] p-5">
              <div className="mx-auto w-fit rounded-full bg-white/5 px-3 py-1 text-[11px] text-white/40">
                Aujourd'hui
              </div>
              <AnimatePresence initial={false}>
                {active.messages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={cn(
                      "flex",
                      m.fromMe ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                        m.fromMe
                          ? "rounded-br-md bg-royal-500 text-white"
                          : "rounded-bl-md bg-white/[0.07] text-white/90"
                      )}
                    >
                      <p>{m.text}</p>
                      <span
                        className={cn(
                          "mt-1 flex items-center justify-end gap-1 text-[10px]",
                          m.fromMe ? "text-white/70" : "text-white/40"
                        )}
                      >
                        {m.time}
                        {m.fromMe && (
                          <CheckCheck
                            className={cn(
                              "h-3 w-3",
                              m.read ? "text-sky-200" : "text-white/50"
                            )}
                          />
                        )}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Composer */}
            <div className="border-t border-white/10 p-3 pb-safe">
              <div className="flex items-center gap-2 rounded-2xl bg-white/[0.04] p-2">
                <button className="grid h-9 w-9 place-items-center rounded-full text-white/50 hover:bg-white/5 hover:text-white">
                  <Paperclip className="h-4 w-4" />
                </button>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder="Écrivez un message…"
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
                />
                <button className="grid h-9 w-9 place-items-center rounded-full text-white/50 hover:bg-white/5 hover:text-white">
                  <Smile className="h-4 w-4" />
                </button>
                <button
                  onClick={send}
                  className="grid h-10 w-10 place-items-center rounded-full bg-royal-500 text-white transition hover:bg-royal-400 disabled:opacity-40"
                  disabled={!draft.trim()}
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center text-white/40">
            Sélectionnez une conversation
          </div>
        )}
      </section>
    </div>
  );
}
