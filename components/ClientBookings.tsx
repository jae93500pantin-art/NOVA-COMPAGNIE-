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
  MessagesSquare,
  CheckCircle2,
  CheckCheck,
  XCircle,
  Ban,
  Hourglass,
  CreditCard,
  Star,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getDriver } from "@/lib/drivers";
import { clientIdOf, getBookedDrivers, BOOKED_EVENT } from "@/lib/clientBookings";
import type { Booking } from "@/lib/bookings";
import { statusLabel, formatWhen, bookingQuantityLabel } from "@/lib/bookings";
import { chatStateForBooking } from "@/lib/chat";
import { whatsappUrl } from "@/lib/whatsapp";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PaymentDialog } from "./PaymentDialog";
import { BookingChat } from "./BookingChat";
import { ReviewForm } from "./ReviewForm";

/**
 * Client view of their own course requests, with live status updates.
 * Subscribes to every driver room the client has booked, filtering to their
 * own bookings via the stable client id.
 */
export function ClientBookings() {
  const { user, loading } = useAuth();
  const { t, lang } = useI18n();
  const router = useRouter();
  const [byId, setById] = useState<Record<string, Booking>>({});
  const [payBooking, setPayBooking] = useState<Booking | null>(null);
  const [openChatId, setOpenChatId] = useState<string | null>(null);
  const [openReviewId, setOpenReviewId] = useState<string | null>(null);
  /** Rides reviewed in this session — the button disappears once used. */
  const [reviewed, setReviewed] = useState<string[]>([]);
  const sourcesRef = useRef<EventSource[]>([]);

  /** Client-side cancellation — the driver sees it live, the chat archives. */
  const cancel = async (b: Booking) => {
    if (!window.confirm(t("chat.cancelConfirm"))) return;
    setById((prev) => ({ ...prev, [b.id]: { ...b, status: "cancelled" } }));
    await fetch(`/api/bookings/${b.driverId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: b.id, status: "cancelled" }),
    }).catch(() => {});
  };

  // Role guard. This page is the CLIENT view: it only streams the driver rooms
  // this browser has booked and keeps the rows whose clientId is our own — so a
  // driver landing here (bookmark, typed URL) would always see an empty list
  // instead of their incoming rides. Send them to their own page.
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/auth/login");
    else if (user.role === "driver") router.replace("/compte/courses");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || user.role === "driver") return;

    const connect = () => {
      // Tear down previous streams.
      sourcesRef.current.forEach((es) => es.close());
      sourcesRef.current = [];
      const cid = clientIdOf(user);
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

  // Include the role here too, so a driver never flashes an empty client list
  // during the redirect.
  if (loading || !user || user.role === "driver") {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

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
              const chatState = chatStateForBooking(b);
              const chatOpen = openChatId === b.id;
              const reviewOpen = openReviewId === b.id;
              const cancellable =
                b.status === "pending" ||
                b.status === "confirmed" ||
                b.status === "paid";
              return (
                <motion.div
                  key={b.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl glass p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                          <Clock className="h-3 w-3" /> {bookingQuantityLabel(b, lang)} · €{b.total} · {formatWhen(b.when, lang)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={b.status} />
                      {b.status === "confirmed" && (
                        <button
                          onClick={() => setPayBooking(b)}
                          className="btn-primary text-xs"
                        >
                          <CreditCard className="h-4 w-4" />
                          Payer €{b.total}
                        </button>
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
                      {/* A review needs a finished ride — nowhere else to start it. */}
                      {b.status === "completed" && !reviewed.includes(b.id) && (
                        <button
                          onClick={() =>
                            setOpenReviewId(reviewOpen ? null : b.id)
                          }
                          className="btn-ghost text-xs"
                          aria-expanded={reviewOpen}
                        >
                          <Star className="h-4 w-4 text-gold-400" />
                          Laisser un avis
                        </button>
                      )}
                      {cancellable && (
                        <button
                          onClick={() => void cancel(b)}
                          className="btn-ghost text-xs text-red-300 hover:text-red-200"
                        >
                          {t("chat.cancel")}
                        </button>
                      )}
                      {driver && (
                        <a
                          href={whatsappUrl(
                            `Bonjour, au sujet de ma réservation avec ${driver.firstName}.`
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-green-400 transition hover:bg-white/5"
                          aria-label="WhatsApp"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {reviewOpen && (
                      <ReviewForm
                        booking={b}
                        clientName={
                          `${user.firstName} ${user.lastName}`.trim() || b.clientName
                        }
                        onPublished={() => setReviewed((prev) => [...prev, b.id])}
                      />
                    )}
                  </AnimatePresence>

                  <AnimatePresence initial={false}>
                    {chatOpen && (
                      <div className="mt-3">
                        <BookingChat
                          booking={b}
                          senderId={b.clientId}
                          senderName={
                            `${user.firstName} ${user.lastName}`.trim() || b.clientName
                          }
                          role="client"
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

      {payBooking && (
        <PaymentDialog
          booking={payBooking}
          onClose={() => setPayBooking(null)}
          onPaid={() => setPayBooking(null)}
        />
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
    completed: { icon: CheckCheck, cls: "border-white/15 bg-white/5 text-white/60" },
    cancelled: { icon: Ban, cls: "border-white/15 bg-white/5 text-white/45" },
  } as const;
  const { icon: Icon, cls } = map[status];
  return (
    <span className={cn("chip", cls)}>
      <Icon className="h-3 w-3" /> {statusLabel(status)}
    </span>
  );
}
