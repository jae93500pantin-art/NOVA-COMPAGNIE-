"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Wifi,
  WifiOff,
  Users,
  Smartphone,
  Monitor,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LiveMessage } from "@/lib/liveBroker";

function detectDevice(): { name: string; isPhone: boolean } {
  if (typeof navigator === "undefined") return { name: "Appareil", isPhone: false };
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return { name: "iPhone", isPhone: true };
  if (/Android/i.test(ua)) return { name: "Téléphone", isPhone: true };
  if (/Macintosh/i.test(ua)) return { name: "Mac", isPhone: false };
  if (/Windows/i.test(ua)) return { name: "PC", isPhone: false };
  return { name: "Ordinateur", isPhone: false };
}

function getSenderId(): string {
  if (typeof window === "undefined") return "";
  const key = "lumecar_live_sender";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

export function LiveChat({ room }: { room: string }) {
  const [device, setDevice] = useState<{ name: string; isPhone: boolean }>({
    name: "",
    isPhone: false,
  });
  const [name, setName] = useState("");
  const [senderId, setSenderId] = useState("");
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [connected, setConnected] = useState(false);
  const [presence, setPresence] = useState(1);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Detect device & identity on the client only (avoids hydration mismatch).
  useEffect(() => {
    const d = detectDevice();
    setDevice(d);
    setName((prev) => prev || d.name);
    setSenderId(getSenderId());
    setShareUrl(window.location.href);
  }, []);

  // Subscribe to the SSE stream.
  useEffect(() => {
    const es = new EventSource(`/api/live/${room}`);

    es.addEventListener("history", (e) => {
      try {
        setMessages(JSON.parse((e as MessageEvent).data));
        setConnected(true);
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("message", (e) => {
      try {
        const msg: LiveMessage = JSON.parse((e as MessageEvent).data);
        setMessages((prev) =>
          prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
        );
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("presence", (e) => {
      try {
        setPresence(JSON.parse((e as MessageEvent).data).count ?? 1);
      } catch {
        /* ignore */
      }
    });
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    return () => es.close();
  }, [room]);

  // Auto-scroll the message list to the latest message (container only,
  // never the whole page).
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !senderId) return;
    setDraft("");
    try {
      await fetch(`/api/live/${room}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, sender: name || "Invité", senderId }),
      });
    } catch {
      // Re-show the draft on failure.
      setDraft(text);
    }
  }, [draft, name, room, senderId]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Chat panel */}
      <div className="flex h-[calc(100dvh-12rem)] min-h-[420px] flex-col overflow-hidden rounded-3xl glass-strong">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-royal-400 to-royal-600 shadow-glow">
              {device.isPhone ? (
                <Smartphone className="h-5 w-5 text-white" />
              ) : (
                <Monitor className="h-5 w-5 text-white" />
              )}
            </span>
            <div>
              <p className="text-sm font-semibold text-white">Salon live</p>
              <p className="flex items-center gap-1.5 text-xs">
                {connected ? (
                  <span className="flex items-center gap-1 text-emerald-400">
                    <Wifi className="h-3 w-3" /> Connecté
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-400">
                    <WifiOff className="h-3 w-3" /> Reconnexion…
                  </span>
                )}
                <span className="text-white/30">·</span>
                <span className="flex items-center gap-1 text-white/50">
                  <Users className="h-3 w-3" /> {presence} en ligne
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-3 overflow-y-auto scroll-touch bg-[radial-gradient(circle_at_50%_0%,rgba(47,99,255,0.06),transparent_40%)] p-5" ref={listRef}>
          {messages.length === 0 && (
            <div className="grid h-full place-items-center text-center text-sm text-white/40">
              <div>
                <p>Aucun message pour l’instant.</p>
                <p className="mt-1 text-xs">
                  Ouvrez cette page sur votre téléphone pour démarrer la
                  conversation.
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
                        "mt-1 block text-right text-[10px]",
                        mine ? "text-white/70" : "text-white/40"
                      )}
                    >
                      {new Date(m.ts).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Composer */}
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
              placeholder="Votre message…"
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
      </div>

      {/* Side panel */}
      <aside className="space-y-4">
        <div className="rounded-3xl glass p-5">
          <h3 className="text-sm font-semibold text-white">Votre identité</h3>
          <label className="mt-3 block text-xs text-white/40">
            Nom affiché
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            className="input mt-1.5"
          />
          <p className="mt-3 flex items-center gap-2 text-xs text-white/50">
            {device.isPhone ? (
              <Smartphone className="h-3.5 w-3.5" />
            ) : (
              <Monitor className="h-3.5 w-3.5" />
            )}
            {device.name ? `Détecté : ${device.name}` : "Détection…"}
          </p>
        </div>

        <div className="rounded-3xl glass p-5">
          <h3 className="text-sm font-semibold text-white">Inviter l’autre appareil</h3>
          <p className="mt-2 text-xs leading-relaxed text-white/50">
            Sur votre iPhone, ouvrez la même page. Les deux appareils rejoignent
            automatiquement le salon&nbsp;
            <span className="font-mono text-royal-300">{room}</span>.
          </p>
          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[11px] uppercase tracking-wider text-white/30">
              Adresse réseau
            </p>
            <p className="mt-1 break-all font-mono text-xs text-white/70">
              {shareUrl || "…"}
            </p>
          </div>
          <button
            onClick={copyLink}
            className="btn-ghost mt-3 w-full text-sm"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-400" /> Lien copié
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" /> Copier le lien actuel
              </>
            )}
          </button>
        </div>

        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.06] p-5">
          <p className="text-xs leading-relaxed text-emerald-200/80">
            🔒 Messages éphémères : ils transitent uniquement en mémoire vive du
            serveur local et ne sont jamais enregistrés.
          </p>
        </div>
      </aside>
    </div>
  );
}
