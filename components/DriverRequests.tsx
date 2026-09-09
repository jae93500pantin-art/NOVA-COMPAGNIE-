"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin,
  CheckCircle2,
  CheckCheck,
  XCircle,
  Inbox,
  Wifi,
  WifiOff,
  MessagesSquare,
} from "lucide-react";
import type { Booking, BookingStatus } from "@/lib/bookings";
import { statusLabel, formatWhen, bookingQuantityLabel } from "@/lib/bookings";
import { chatStateForBooking } from "@/lib/chat";
import { getDriver } from "@/lib/drivers";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { BookingChat } from "./BookingChat";

/**
 * Live incoming course requests for a driver, over SSE.
 * The driver can accept or refuse; the client sees the result in real time.
 */
export function DriverRequests({
  driverId,
  onBookingsChange,
}: {
  driverId: string;
  /** Lets a parent derive state (e.g. "En course") off this same stream. */
  onBookingsChange?: (bookings: Booking[]) => void;
}) {
  const { t, lang } = useI18n();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [connected, setConnected] = useState(false);
  const [openChatId, setOpenChatId] = useState<string | null>(null);
  const driver = getDriver(driverId);
  const driverName = driver
    ? `${driver.firstName} ${driver.lastName}`.trim()
    : "Chauffeur";

  useEffect(() => {
    const es = new EventSource(`/api/bookings/${driverId}`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (ev) => {
      try {
        const e = JSON.parse(ev.data);
        if (e.type === "snapshot") {
          setBookings(e.bookings);
          setConnected(true);
        } else if (e.type === "booking") {
          setBookings((prev) =>
            prev.some((b) => b.id === e.booking.id) ? prev : [e.booking, ...prev]
          );
        } else if (e.type === "status") {
          setBookings((prev) =>
            prev.map((b) => (b.id === e.booking.id ? e.booking : b))
          );
        }
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, [driverId]);

  useEffect(() => {
    onBookingsChange?.(bookings);
  }, [bookings, onBookingsChange]);

  const act = useCallback(
    async (bookingId: string, status: BookingStatus) => {
      // Optimistic update.
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status } : b))
      );
      await fetch(`/api/bookings/${driverId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, status }),
      }).catch(() => {});
    },
    [driverId]
  );

  const pending = bookings.filter((b) => b.status === "pending");
  const handled = bookings.filter((b) => b.status !== "pending");

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-white/40">
          {pending.length} en attente · {bookings.length} au total
        </p>
        <span className="flex items-center gap-1 text-xs">
          {connected ? (
            <span className="flex items-center gap-1 text-emerald-400">
              <Wifi className="h-3 w-3" /> Temps réel
            </span>
          ) : (
            <span className="flex items-center gap-1 text-amber-400">
              <WifiOff className="h-3 w-3" /> Connexion…
            </span>
          )}
        </span>
      </div>

      {bookings.length === 0 ? (
        <div className="grid place-items-center rounded-2xl glass p-10 text-center">
          <Inbox className="h-8 w-8 text-white/30" />
          <p className="mt-3 text-sm text-white/50">
            Aucune demande pour l’instant.
          </p>
          <p className="text-xs text-white/35">
            Les nouvelles courses apparaissent ici en direct.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {[...pending, ...handled].map((b) => {
              const chatState = chatStateForBooking(b);
              const chatOpen = openChatId === b.id;
              return (
              <motion.div
                key={b.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-2xl glass p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-white/5 text-sm font-semibold text-white">
                      {b.clientName.split(" ").map((x) => x[0]).join("").slice(0, 2)}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">{b.clientName}</p>
                      <p className="flex items-center gap-1 text-xs text-white/50">
                        <MapPin className="h-3 w-3" /> {bookingQuantityLabel(b, lang)} · {formatWhen(b.when, lang)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-white">€{b.total}</span>
                    {b.status === "pending" ? (
                      <>
                        <button
                          onClick={() => act(b.id, "refused")}
                          className="btn-ghost text-xs"
                        >
                          <XCircle className="h-4 w-4" /> Refuser
                        </button>
                        {/* Accepter ENCAISSE : les fonds du client sont déjà
                            autorisés depuis sa demande, l'acceptation
                            déclenche la capture côté serveur. D'où `paid`
                            directement, sans étape « à payer » intermédiaire. */}
                        <button
                          onClick={() => act(b.id, "paid")}
                          className="btn-primary text-xs"
                        >
                          <CheckCircle2 className="h-4 w-4" /> Accepter
                        </button>
                      </>
                    ) : (
                      <span
                        className={cn(
                          "chip",
                          b.status === "paid"
                            ? "border-royal-400/30 bg-royal-500/10 text-royal-200"
                            : b.status === "confirmed"
                              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                              : b.status === "completed" || b.status === "cancelled"
                                ? "border-white/15 bg-white/5 text-white/55"
                                : "border-red-400/30 bg-red-400/10 text-red-300"
                        )}
                      >
                        {statusLabel(b.status)}
                      </span>
                    )}
                    {chatState !== "locked" && (
                      <button
                        onClick={() => setOpenChatId(chatOpen ? null : b.id)}
                        className="btn-ghost text-xs"
                        aria-expanded={chatOpen}
                      >
                        <MessagesSquare className="h-4 w-4" />
                        {chatOpen ? t("chat.close") : t("chat.open")}
                      </button>
                    )}
                    {b.status === "paid" && (
                      <button
                        onClick={() => {
                          if (window.confirm(t("chat.completeConfirm"))) {
                            void act(b.id, "completed");
                          }
                        }}
                        className="btn-primary text-xs"
                      >
                        <CheckCheck className="h-4 w-4" /> {t("chat.complete")}
                      </button>
                    )}
                    {(b.status === "confirmed" || b.status === "paid") && (
                      <button
                        onClick={() => {
                          if (window.confirm(t("chat.cancelConfirm"))) {
                            void act(b.id, "cancelled");
                          }
                        }}
                        className="btn-ghost text-xs text-red-300 hover:text-red-200"
                      >
                        {t("chat.cancel")}
                      </button>
                    )}
                  </div>
                </div>

                <AnimatePresence initial={false}>
                  {chatOpen && (
                    <div className="mt-3">
                      <BookingChat
                        booking={b}
                        senderId={b.driverId}
                        senderName={driverName}
                        role="driver"
                      />
                    </div>
                  )}
                </AnimatePresence>
              </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
