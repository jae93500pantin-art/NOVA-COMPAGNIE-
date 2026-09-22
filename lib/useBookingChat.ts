"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Booking } from "./bookings";
import {
  chatStateForBooking,
  chatClosesAt,
  CHAT_GRACE_AFTER_CLOSE_MS,
  type ChatMessage,
  type ChatRole,
  type ChatState,
} from "./chat";

/**
 * Messagerie d'une course, côté navigateur.
 *
 * ## Pourquoi ce hook ne prend pas qu'un `bookingId`
 *
 * Le cycle de vie du fil (verrouillé → ouvert → délai de grâce → archivé) se
 * **déduit de la réservation**, jamais d'un état propre au tchat. Ne lui
 * passer qu'un identifiant obligerait à relire la course ici, et on aurait
 * alors deux sources de vérité qui divergent le temps d'un aller-retour
 * réseau : le bandeau dirait « course terminée » pendant que le champ de
 * saisie serait encore actif. La réservation arrive donc déjà résolue, depuis
 * le flux SSE que `ClientBookings` et `DriverRequests` tiennent déjà ouvert.
 *
 * ## Transport : SSE, pas Supabase Realtime
 *
 * Le pub/sub vit dans le process serveur (`lib/chatBroker.ts`) et sort par un
 * flux SSE. Ce n'est pas un provisoire : les écritures passent toutes par les
 * routes `/api/chat/*`, qui vérifient l'identité de session et la légitimité
 * du participant. Un abonnement Realtime posé depuis le navigateur écrirait
 * avec le jeton anon, c'est-à-dire par une seconde porte que la plateforme a
 * délibérément fermée (voir CLAUDE.md, § Persistance). Le jour où plusieurs
 * process serviront le site, c'est le broker qui basculera sur Realtime —
 * côté serveur, sans rien changer ici.
 */

export interface BookingChatViewer {
  /** Id stable du lecteur dans cette course : son id client, ou l'id chauffeur. */
  senderId: string;
  senderName: string;
  role: ChatRole;
}

export interface UseBookingChat {
  messages: ChatMessage[];
  /** Historique reçu — distingue « vide » de « pas encore chargé ». */
  ready: boolean;
  state: ChatState;
  /** Écriture possible : ouvert, ou dans le délai de grâce. */
  canSend: boolean;
  sending: boolean;
  /** Dernier échec d'envoi, remis à zéro à la tentative suivante. */
  error: string | null;
  /** Minutes restantes avant verrouillage (0 hors délai de grâce). */
  minutesLeft: number;
  sendMessage: (content: string, isQuickReply?: boolean) => Promise<boolean>;
}

/** Cadence du compte à rebours : la minute affichée n'a pas besoin de mieux. */
const TICK_MS = 20_000;

export function useBookingChat(
  booking: Booking,
  viewer: BookingChatViewer
): UseBookingChat {
  const { senderId, senderName, role } = viewer;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ready, setReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Fin du délai de grâce annoncée par le serveur.
   *
   * ⚠️ Nécessaire en plus de `booking.closedAt` : la course arrive par un
   * autre flux SSE (celui du chauffeur), et rien ne garantit lequel des deux
   * événements arrive en premier. Sans cette valeur, la conversation resterait
   * « ouverte » jusqu'au prochain rafraîchissement de la réservation.
   */
  const [closesAt, setClosesAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const baseState = chatStateForBooking(booking, now);
  const deadline = closesAt ?? chatClosesAt(booking);

  const state: ChatState = useMemo(() => {
    if (closesAt !== null) return now < closesAt ? "grace" : "archived";
    return baseState;
  }, [closesAt, now, baseState]);

  const canSend = state === "open" || state === "grace";
  const minutesLeft =
    state === "grace" && deadline !== null
      ? Math.max(1, Math.ceil((deadline - now) / 60_000))
      : 0;

  /* ---------------------------------------------------------------------- */
  /*  Flux temps réel                                                        */
  /* ---------------------------------------------------------------------- */

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
        } else if (e.type === "receipts") {
          // Les accusés portent sur les messages écrits par `for` : ce sont
          // les nôtres quand c'est notre rôle, ceux d'en face sinon.
          setMessages((prev) =>
            prev.map((m) =>
              m.role === e.for
                ? {
                    ...m,
                    deliveredAt: m.deliveredAt ?? e.deliveredAt,
                    readAt: m.readAt ?? e.readAt,
                  }
                : m
            )
          );
        } else if (e.type === "closed") {
          setClosesAt(
            typeof e.closesAt === "number"
              ? e.closesAt
              : Date.now() + CHAT_GRACE_AFTER_CLOSE_MS
          );
        }
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
    // `state` n'est pas dans les dépendances au-delà du verrou initial : une
    // reconnexion à chaque minute du compte à rebours rouvrirait le flux pour
    // rien. Seul le passage de « verrouillé » à autre chose compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking.id, senderId, state === "locked"]);

  /* ---------------------------------------------------------------------- */
  /*  Horloge du délai de grâce                                              */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    // Aucune échéance en vue : pas de minuterie. Un intervalle qui tourne sur
    // chaque course affichée réveillerait le téléphone pour rien.
    if (deadline === null || Date.now() >= deadline) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [deadline]);

  /* ---------------------------------------------------------------------- */
  /*  Accusés de lecture                                                     */
  /* ---------------------------------------------------------------------- */

  /**
   * Dernier message d'en face déjà signalé comme lu. Sans ce garde-fou, chaque
   * rendu relancerait une requête : le fil est affiché en continu sous la
   * carte de réservation, pas ouvert puis refermé.
   */
  const lastReadRef = useRef<string>("");
  const incoming = messages.filter((m) => m.role !== role);
  const lastIncomingId = incoming.length ? incoming[incoming.length - 1].id : "";

  useEffect(() => {
    if (!ready || !lastIncomingId || state === "locked") return;
    if (lastReadRef.current === lastIncomingId) return;
    lastReadRef.current = lastIncomingId;
    void fetch(`/api/chat/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderId }),
    }).catch(() => {
      // Un accusé perdu n'est pas un incident : il repartira au prochain
      // message. Le rejouer en boucle, si.
      lastReadRef.current = "";
    });
  }, [ready, lastIncomingId, state, booking.id, senderId]);

  /* ---------------------------------------------------------------------- */
  /*  Envoi                                                                  */
  /* ---------------------------------------------------------------------- */

  const sendMessage = useCallback(
    async (content: string, isQuickReply = false): Promise<boolean> => {
      const text = content.trim();
      if (!text || sending || !canSend) return false;
      setSending(true);
      setError(null);
      try {
        const res = await fetch(`/api/chat/${booking.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ senderId, senderName, text, isQuickReply }),
        });
        if (!res.ok) {
          setError(res.status === 409 ? "closed" : "failed");
          return false;
        }
        // Le message revient par le flux SSE comme celui d'en face : pas
        // d'insertion optimiste ici, sinon il apparaîtrait deux fois — une
        // copie locale, puis celle du serveur, avec l'id de la base.
        return true;
      } catch {
        setError("failed");
        return false;
      } finally {
        setSending(false);
      }
    },
    [booking.id, senderId, senderName, sending, canSend]
  );

  return {
    messages,
    ready,
    state,
    canSend,
    sending,
    error,
    minutesLeft,
    sendMessage,
  };
}
