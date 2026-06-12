"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, CheckCircle2, XCircle, Inbox, Wifi, WifiOff } from "lucide-react";
import type { Booking } from "@/lib/bookings";
import { statusLabel } from "@/lib/bookings";
import { cn } from "@/lib/utils";

/**
 * Live incoming course requests for a driver, over SSE.
 * The driver can accept or refuse; the client sees the result in real time.
 */
export function DriverRequests({ driverId }: { driverId: string }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [connected, setConnected] = useState(false);

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

  const act = useCallback(
    async (bookingId: string, status: "confirmed" | "refused") => {
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
            {[...pending, ...handled].map((b) => (
              <motion.div
                key={b.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-3 rounded-2xl glass p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-white/5 text-sm font-semibold text-white">
                    {b.clientName.split(" ").map((x) => x[0]).join("").slice(0, 2)}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{b.clientName}</p>
                    <p className="flex items-center gap-1 text-xs text-white/50">
                      <MapPin className="h-3 w-3" /> {b.hours} h · {b.when}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-white">€{b.total}</span>
                  {b.status === "pending" ? (
                    <>
                      <button
                        onClick={() => act(b.id, "refused")}
                        className="btn-ghost text-xs"
                      >
                        <XCircle className="h-4 w-4" /> Refuser
                      </button>
                      <button
                        onClick={() => act(b.id, "confirmed")}
                        className="btn-primary text-xs"
                      >
                        <CheckCircle2 className="h-4 w-4" /> Accepter
                      </button>
                    </>
                  ) : (
                    <span
                      className={cn(
                        "chip",
                        b.status === "confirmed"
                          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                          : "border-red-400/30 bg-red-400/10 text-red-300"
                      )}
                    >
                      {statusLabel(b.status)}
                    </span>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
