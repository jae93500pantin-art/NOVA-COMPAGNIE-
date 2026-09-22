"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Archive,
  Check,
  CheckCheck,
  Clock,
  Loader2,
  Lock,
  Send,
  ShieldAlert,
  Zap,
} from "lucide-react";
import { formatWhen, statusLabel, type Booking } from "@/lib/bookings";
import {
  formatMessageTime,
  isSameSenderAsPrevious,
  messageDeliveryStatus,
  MAX_CHAT_MESSAGE_LEN,
  type ChatMessage,
  type ChatRole,
} from "@/lib/chat";
import { quickRepliesFor } from "@/lib/chatQuickReplies";
import { useBookingChat } from "@/lib/useBookingChat";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  booking: Booking;
  /** Stable id of the viewer: their client id, or the driver id. */
  senderId: string;
  senderName: string;
  role: ChatRole;
  /** Nom du correspondant, quand l'appelant le connaît (côté client : le chauffeur). */
  peerName?: string;
}

/**
 * Chat thread scoped to one booking, live over SSE.
 *
 * Rendered inline under a booking card. Writable while the ride is paid, and
 * pendant les 30 minutes qui suivent sa clôture (voir `lib/chat.ts`) — c'est
 * là que se règlent l'objet oublié et la facture. Ensuite : lecture seule.
 *
 * ⚠️ Tout ce qui touche au transport, au cycle de vie et aux accusés vit dans
 * `useBookingChat`. Ce fichier ne fait que de l'affichage : c'est ce qui rend
 * la règle « une conversation existe parce qu'une course existe » vérifiable
 * ailleurs qu'à l'œil nu.
 */
export function BookingChat({
  booking,
  senderId,
  senderName,
  role,
  peerName,
}: Props) {
  const { t, lang } = useI18n();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, ready, state, canSend, sending, error, minutesLeft, sendMessage } =
    useBookingChat(booking, { senderId, senderName, role });

  // Keep the newest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    const ok = await sendMessage(text);
    if (!ok) setDraft(text); // put it back so nothing is lost
  };

  if (state === "locked") {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-white/45">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        {t("chat.locked")}
      </div>
    );
  }

  const peer =
    role === "driver"
      ? booking.clientName || t("chat.peerClient")
      : peerName || t("chat.peerDriver");

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
    >
      {/* Bandeau — qui est en face, et où en est la course. Il reste visible
          quand l'historique défile : sur un téléphone, c'est la seule chose
          qui rappelle de quelle course on parle. */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-ink-900/80 px-4 py-3 backdrop-blur">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-royal-500/20 text-xs font-semibold text-royal-100">
          {peerInitials(peer)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{peer}</p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-white/45">
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                state === "open" ? "bg-emerald-400" : "bg-white/40"
              )}
            />
            {statusLabel(booking.status)}
            {booking.when && (
              <>
                <span className="text-white/20">·</span>
                <Clock className="h-3 w-3 shrink-0" />
                <span className="truncate">{formatWhen(booking.when, lang)}</span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Compte à rebours — dire combien de temps il reste vaut mieux que de
          laisser le champ se désactiver sans prévenir au milieu d'une phrase. */}
      {state === "grace" && (
        <div className="flex items-center gap-2 border-b border-amber-400/20 bg-amber-400/[0.07] px-4 py-2 text-[11px] text-amber-200">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>
            {t("chat.graceIn")} {minutesLeft} min
          </span>
        </div>
      )}

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
          messages.map((m, i) => (
            <Bubble
              key={m.id}
              message={m}
              mine={m.senderId === senderId}
              grouped={isSameSenderAsPrevious(messages, i)}
              lang={lang}
              t={t}
            />
          ))
        )}
      </div>

      {canSend ? (
        <>
          {/* Réponses rapides — un geste au lieu d'une saisie. Voir
              lib/chatQuickReplies.ts : c'est d'abord une mesure de sécurité
              routière, pas un raccourci de confort. */}
          <div className="flex gap-1.5 overflow-x-auto border-t border-white/10 px-2.5 pt-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="sr-only">{t("chat.quickLabel")}</span>
            {quickRepliesFor(role).map((q) => (
              <button
                key={q.id}
                type="button"
                disabled={sending}
                onClick={() => void sendMessage(t(q.key), true)}
                className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/75 transition hover:border-royal-400/40 hover:bg-royal-500/15 hover:text-white active:scale-[0.97] disabled:opacity-40"
              >
                <Zap className="mr-1 inline h-3 w-3 text-royal-300" />
                {t(q.key)}
              </button>
            ))}
          </div>

          <div className="flex items-end gap-2 p-2.5">
            <textarea
              value={draft}
              onChange={(e) =>
                setDraft(e.target.value.slice(0, MAX_CHAT_MESSAGE_LEN))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              rows={1}
              placeholder={t("chat.placeholder")}
              aria-label={t("chat.placeholder")}
              className="input max-h-28 min-h-[42px] flex-1 resize-none py-2.5"
            />
            <button
              onClick={() => void submit()}
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

          {error && (
            <p className="px-4 pb-2 text-[11px] text-amber-300">
              {t(error === "closed" ? "chat.errorClosed" : "chat.errorSend")}
            </p>
          )}

          <p className="flex items-start gap-1.5 border-t border-white/5 px-4 py-2 text-[10px] leading-relaxed text-white/30">
            <ShieldAlert className="mt-px h-3 w-3 shrink-0" />
            {t("chat.maskNotice")}
          </p>
        </>
      ) : (
        <div className="flex items-center gap-2 border-t border-white/10 px-4 py-3 text-xs text-white/45">
          <Archive className="h-3.5 w-3.5 shrink-0" />
          {t("chat.closed")}
        </div>
      )}
    </motion.div>
  );
}

/**
 * Initiales du correspondant. `initials()` de lib/utils prend un prénom et un
 * nom séparés ; ici on ne dispose que d'un libellé déjà composé, qui peut même
 * être générique (« Votre chauffeur »).
 */
function peerInitials(name: string): string {
  const parts = name.trim().split(/s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return `${first}${last}`.toUpperCase();
}

/** Une bulle, ses accusés, et l'avertissement de masquage s'il y a lieu. */
function Bubble({
  message,
  mine,
  grouped,
  lang,
  t,
}: {
  message: ChatMessage;
  mine: boolean;
  grouped: boolean;
  lang: "fr" | "en";
  t: (key: string) => string;
}) {
  const status = messageDeliveryStatus(message);

  return (
    <div
      className={cn(
        "flex flex-col",
        mine ? "items-end" : "items-start",
        grouped ? "mt-0.5" : "mt-3 first:mt-0"
      )}
    >
      {!grouped && (
        <span className="mb-1 px-1 text-[11px] text-white/35">
          {mine ? t("chat.you") : message.senderName}
        </span>
      )}
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm",
          mine ? "bg-royal-500/20 text-white" : "bg-white/[0.07] text-white/90"
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.text}</p>
        <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-white/35">
          {formatMessageTime(message.createdAt, lang)}
          {/* Les accusés ne s'affichent que sur SES propres messages : savoir
              si l'on a lu ceux d'en face n'apprend rien à personne. */}
          {mine && (
            <span title={t(`chat.status.${status}`)} aria-label={t(`chat.status.${status}`)}>
              {status === "sent" ? (
                <Check className="h-3 w-3" />
              ) : (
                <CheckCheck
                  className={cn(
                    "h-3 w-3",
                    status === "read" && "text-royal-300"
                  )}
                />
              )}
            </span>
          )}
        </span>
      </div>
      {/* Seul l'expéditeur est averti : le destinataire voit des astérisques,
          il n'a pas besoin qu'on lui explique ce qu'il ne reçoit pas. */}
      {mine && message.masked && (
        <span className="mt-1 flex items-center gap-1 px-1 text-[10px] text-amber-300/80">
          <ShieldAlert className="h-3 w-3 shrink-0" />
          {t("chat.masked")}
        </span>
      )}
    </div>
  );
}
