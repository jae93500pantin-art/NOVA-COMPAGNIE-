"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  ChevronLeft,
  Phone,
  Video,
  Wifi,
  WifiOff,
  CheckCheck,
  LogIn,
  MessageSquare,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getDriver, drivers } from "@/lib/drivers";
import { getContacts, addContact, roomForDriver, CONTACTS_EVENT } from "@/lib/contacts";
import type { LiveMessage } from "@/lib/liveBroker";
import { cn } from "@/lib/utils";

interface Thread {
  /** Driver this conversation is about. */
  driverId: string;
  room: string;
}

function getSenderId(): string {
  if (typeof window === "undefined") return "";
  const key = "lumecar_msg_sender";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

export function RealMessages() {
  const { user, loading } = useAuth();
  const params = useSearchParams();
  const requestedDriver = params.get("driver");

  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [showThread, setShowThread] = useState(false);
  const [senderId, setSenderId] = useState("");

  useEffect(() => setSenderId(getSenderId()), []);

  // Build the conversation list based on the role.
  useEffect(() => {
    if (loading) return;

    if (user?.role === "driver" && user.driverId) {
      // Driver sees the single inbound conversation room for their profile.
      const room = roomForDriver(user.driverId);
      setThreads([{ driverId: user.driverId, room }]);
      setActiveRoom(room);
      return;
    }

    // Client (or guest): conversations = drivers contacted, plus the one in the URL.
    const rebuild = () => {
      // Ensure the driver from the URL is registered as a contact.
      if (requestedDriver && getDriver(requestedDriver)) {
        addContact(requestedDriver);
      }
      const ids = getContacts();
      const list = ids
        .filter((id) => getDriver(id))
        .map((id) => ({ driverId: id, room: roomForDriver(id) }));
      setThreads(list);
      setActiveRoom((prev) => {
        if (requestedDriver && getDriver(requestedDriver)) {
          return roomForDriver(requestedDriver);
        }
        return prev ?? (list[0] ? list[0].room : null);
      });
      if (requestedDriver) setShowThread(true);
    };
    rebuild();
    window.addEventListener(CONTACTS_EVENT, rebuild);
    return () => window.removeEventListener(CONTACTS_EVENT, rebuild);
  }, [user, loading, requestedDriver]);

  if (loading) return null;

  if (!user) {
    return (
      <div className="grid min-h-[50vh] place-items-center rounded-3xl glass-strong p-10 text-center">
        <div>
          <MessageSquare className="mx-auto h-10 w-10 text-white/30" />
          <h2 className="mt-4 text-lg font-semibold text-white">
            Connectez-vous pour discuter
          </h2>
          <p className="mt-1 text-sm text-white/50">
            La messagerie relie en temps réel clients et chauffeurs.
          </p>
          <Link href="/auth/login" className="btn-primary mt-5">
            <LogIn className="h-4 w-4" /> Se connecter
          </Link>
        </div>
      </div>
    );
  }

  const activeThread = threads.find((t) => t.room === activeRoom) ?? null;

  return (
    <div className="grid h-[calc(100dvh-7rem)] overflow-hidden border-y border-white/10 sm:h-[calc(100dvh-9rem)] sm:rounded-3xl sm:border glass-strong md:grid-cols-[340px_1fr]">
      {/* List */}
      <aside
        className={cn(
          "flex flex-col border-r border-white/10",
          showThread ? "hidden md:flex" : "flex"
        )}
      >
        <div className="border-b border-white/10 p-4">
          <h2 className="text-lg font-semibold text-white">Messages</h2>
          <p className="text-xs text-white/45">
            {user.role === "driver" ? "Vos clients" : "Vos chauffeurs"}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto scroll-touch p-2">
          {threads.length === 0 ? (
            <p className="p-4 text-sm text-white/40">
              Aucune conversation. Contactez un chauffeur depuis son profil.
            </p>
          ) : (
            threads.map((t) => (
              <ConversationRow
                key={t.room}
                thread={t}
                isDriver={user.role === "driver"}
                active={t.room === activeRoom}
                onClick={() => {
                  setActiveRoom(t.room);
                  setShowThread(true);
                }}
              />
            ))
          )}
        </div>
      </aside>

      {/* Thread */}
      <section className={cn("flex flex-col", showThread ? "flex" : "hidden md:flex")}>
        {activeThread && senderId ? (
          <ThreadView
            key={activeThread.room}
            thread={activeThread}
            isDriver={user.role === "driver"}
            senderName={
              user.role === "driver"
                ? `${user.firstName} (chauffeur)`
                : user.firstName || "Client"
            }
            senderId={senderId}
            onBack={() => setShowThread(false)}
          />
        ) : (
          <div className="grid flex-1 place-items-center text-sm text-white/40">
            Sélectionnez une conversation
          </div>
        )}
      </section>
    </div>
  );
}

function ConversationRow({
  thread,
  isDriver,
  active,
  onClick,
}: {
  thread: Thread;
  isDriver: boolean;
  active: boolean;
  onClick: () => void;
}) {
  const driver = getDriver(thread.driverId);
  const title = isDriver ? "Client LumeCar" : `${driver?.firstName} ${driver?.lastName}`;
  const avatar = isDriver
    ? "https://i.pravatar.cc/100?img=45"
    : driver?.avatar ?? "";
  const subtitle = isDriver
    ? "Conversation entrante"
    : `${driver?.car.make} ${driver?.car.model}`;

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl p-3 text-left transition",
        active ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
      )}
    >
      <Image
        src={avatar}
        alt={title}
        width={48}
        height={48}
        className="h-12 w-12 rounded-full object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{title}</p>
        <p className="truncate text-xs text-white/50">{subtitle}</p>
      </div>
    </button>
  );
}

function ThreadView({
  thread,
  isDriver,
  senderName,
  senderId,
  onBack,
}: {
  thread: Thread;
  isDriver: boolean;
  senderName: string;
  senderId: string;
  onBack: () => void;
}) {
  const driver = getDriver(thread.driverId);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [connected, setConnected] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const peerName = isDriver ? "Client" : `${driver?.firstName} ${driver?.lastName}`;
  const peerAvatar = isDriver
    ? "https://i.pravatar.cc/100?img=45"
    : driver?.avatar ?? "";

  // SSE subscription.
  useEffect(() => {
    const es = new EventSource(`/api/live/${thread.room}`);
    es.addEventListener("history", (e) => {
      try {
        setMessages(JSON.parse((e as MessageEvent).data));
        setConnected(true);
      } catch {}
    });
    es.addEventListener("message", (e) => {
      try {
        const m: LiveMessage = JSON.parse((e as MessageEvent).data);
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      } catch {}
    });
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [thread.room]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    try {
      await fetch(`/api/live/${thread.room}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, sender: senderName, senderId }),
      });
    } catch {
      setDraft(text);
    }
  }, [draft, senderName, senderId, thread.room]);

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/5 md:hidden"
          >
            <ChevronLeft className="h-5 w-5 text-white" />
          </button>
          <Image
            src={peerAvatar}
            alt={peerName}
            width={42}
            height={42}
            className="h-10 w-10 rounded-full object-cover"
          />
          <div>
            <p className="text-sm font-semibold text-white">{peerName}</p>
            <p className="flex items-center gap-1 text-xs">
              {connected ? (
                <span className="flex items-center gap-1 text-emerald-400">
                  <Wifi className="h-3 w-3" /> En ligne · temps réel
                </span>
              ) : (
                <span className="flex items-center gap-1 text-amber-400">
                  <WifiOff className="h-3 w-3" /> Connexion…
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {[Phone, Video].map((Icon, i) => (
            <button
              key={i}
              className="grid h-9 w-9 place-items-center rounded-full text-white/60 transition hover:bg-white/5 hover:text-white"
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>

      <div
        ref={listRef}
        className="flex-1 space-y-3 overflow-y-auto scroll-touch bg-[radial-gradient(circle_at_50%_0%,rgba(47,99,255,0.06),transparent_40%)] p-5"
      >
        {messages.length === 0 && (
          <div className="grid h-full place-items-center text-center text-sm text-white/40">
            <div>
              <p>Démarrez la conversation.</p>
              <p className="mt-1 text-xs">
                Vos messages arrivent en temps réel sur l'autre appareil.
              </p>
            </div>
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m) => {
            const mine = m.senderId === senderId;
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={cn("flex", mine ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                    mine
                      ? "rounded-br-md bg-royal-500 text-white"
                      : "rounded-bl-md bg-white/[0.07] text-white/90"
                  )}
                >
                  {!mine && (
                    <p className="mb-0.5 text-[11px] font-semibold text-royal-300">
                      {m.sender}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  <span
                    className={cn(
                      "mt-1 flex items-center justify-end gap-1 text-[10px]",
                      mine ? "text-white/70" : "text-white/40"
                    )}
                  >
                    {new Date(m.ts).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {mine && <CheckCheck className="h-3 w-3 text-sky-200" />}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <div className="border-t border-white/10 p-3 pb-safe">
        <div className="flex items-center gap-2 rounded-2xl bg-white/[0.04] p-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Écrivez un message…"
            className="flex-1 bg-transparent px-2 text-sm text-white placeholder:text-white/30 outline-none"
          />
          <button
            onClick={send}
            disabled={!draft.trim()}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-royal-500 text-white transition hover:bg-royal-400 disabled:opacity-40"
            aria-label="Envoyer"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}
