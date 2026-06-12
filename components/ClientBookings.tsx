"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  Clock,
  Inbox,
  Loader2,
  MessageCircle,
  CheckCircle2,
  XCircle,
  Hourglass,
  CreditCard,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getDriver } from "@/lib/drivers";
import { getClientId, getBookedDrivers, BOOKED_EVENT } from "@/lib/clientBookings";
import type { Booking } from "@/lib/bookings";
import { statusLabel } from "@/lib/bookings";
import { cn } from "@/lib/utils";

/**
 * Client view of their own course requests, with live status updates.
 * Subscribes to every driver room the client has booked, filtering to their
 * own bookings via the stable client id.
 */
export function ClientBookings() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [byId, setById] = useState<Record<string, Booking>>({});
  const [payingId, setPayingId] = useState<string | null>(null);
  const sourcesRef = useRef<EventSource[]>([]);

  useEffect(() => {
    if (!loading && !user) router.replace("/auth/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;

    const connect = () => {
      // Tear down previous streams.
      sourcesRef.current.forEach((es) => es.close());
      sourcesRef.current = [];
      const cid = getClientId();
      const drivers = getBookedDrivers();
      drivers.forEach((driverId) => {
        const es = new EventSource(`/api/bookings/${driverId}`);
        es.onmessage = (ev) => {
          try {
            const e = JSON.parse(ev.data);
            const apply = (b: Booking) => {
              if (b.clientId !== cid) return;
              setById((prev) => ({ ...prev, [b.id]: b }));
            };
            if (e.type === "snapshot") e.bookings.forEach(apply);
            else if (e.type === "booking" || e.type === "status") apply(e.booking);
          } catch {
            /* ignore */
          }
        };
        sourcesRef.current.push(es);
      });
    };

    connect();
    window.addEventListener(BOOKED_EVENT, connect);
    return () => {
      window.removeEventListener(BOOKED_EVENT, connect);
      sourcesRef.current.forEach((es) => es.close());
      sourcesRef.current = [];
    };
  }, [user]);

  if (loading || !user) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  const pay = async (b: Booking) => {
    setPayingId(b.id);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId: b.driverId, hours: b.hours, bookingId: b.id }),
      });
      const data = await res.json();
      if (data.mode === "stripe" && data.url) {
        window.location.href = data.url; // real Stripe Checkout
        return;
      }
      // Demo mode: mark the booking paid directly.
      await fetch(`/api/bookings/${b.driverId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: b.id, status: "paid" }),
      });
    } catch {
      /* ignore — user can retry */
    } finally {
      setPayingId(null);
    }
  };

  const bookings = Object.values(byId).sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div>
      <Link
        href="/compte"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white"
      >
        <ChevronLeft className="h-4 w-4" /> Mon espace
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight text-white">
        Mes réservations
      </h1>
      <p className="mt-1 text-sm text-white/55">
        Suivez en direct l’état de vos demandes de course.
      </p>

      {bookings.length === 0 ? (
        <div className="mt-8 grid place-items-center rounded-3xl glass p-12 text-center">
          <Inbox className="h-9 w-9 text-white/30" />
          <p className="mt-4 text-sm text-white/60">Aucune réservation pour l’instant.</p>
          <p className="mt-1 text-xs text-white/40">
            Réservez un chauffeur depuis son profil.
          </p>
          <Link href="/drivers" className="btn-primary mt-5 text-sm">
            Trouver un chauffeur
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          <AnimatePresence initial={false}>
            {bookings.map((b) => {
              const driver = getDriver(b.driverId);
              return (
                <motion.div
                  key={b.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col gap-3 rounded-2xl glass p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    {driver && (
                      <Image
                        src={driver.avatar}
                        alt={driver.firstName}
                        width={48}
                        height={48}
                        className="h-12 w-12 rounded-xl object-cover"
                      />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {driver ? `${driver.firstName} ${driver.lastName}` : "Chauffeur"}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-white/50">
                        <Clock className="h-3 w-3" /> {b.hours} h · €{b.total}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={b.status} />
                    {b.status === "confirmed" && (
                      <button
                        onClick={() => pay(b)}
                        disabled={payingId === b.id}
                        className="btn-primary text-xs disabled:opacity-60"
                      >
                        {payingId === b.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CreditCard className="h-4 w-4" />
                        )}
                        Payer €{b.total}
                      </button>
                    )}
                    {driver && (
                      <Link
                        href={`/messages?driver=${driver.id}`}
                        className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-white/70 transition hover:bg-white/5 hover:text-white"
                        aria-label="Message"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Link>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Booking["status"] }) {
  const map = {
    pending: { icon: Hourglass, cls: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
    confirmed: { icon: CheckCircle2, cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
    refused: { icon: XCircle, cls: "border-red-400/30 bg-red-400/10 text-red-300" },
    paid: { icon: CreditCard, cls: "border-royal-400/30 bg-royal-500/10 text-royal-200" },
  } as const;
  const { icon: Icon, cls } = map[status];
  return (
    <span className={cn("chip", cls)}>
      <Icon className="h-3 w-3" /> {statusLabel(status)}
    </span>
  );
}
