"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CreditCard,
  Wallet,
  Bitcoin,
  Banknote,
  X,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import type { Booking } from "@/lib/bookings";
import { useI18n } from "@/lib/i18n";

type Method = "card" | "paypal" | "crypto" | "cash";

/**
 * Client payment sheet: pick a payment method for a confirmed booking.
 * - Card → Stripe Checkout when configured, else the simulated demo flow.
 * - PayPal / Crypto / Cash → demo (no backend keys) → marks the booking paid.
 *   Cash is settled directly with the driver on pickup.
 */
export function PaymentDialog({
  booking,
  onClose,
  onPaid,
}: {
  booking: Booking;
  onClose: () => void;
  onPaid: () => void;
}) {
  const { t } = useI18n();
  const [loading, setLoading] = useState<Method | null>(null);
  const [done, setDone] = useState<Method | null>(null);

  const markPaid = () =>
    fetch(`/api/bookings/${booking.driverId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: booking.id, status: "paid" }),
    });

  const pay = async (m: Method) => {
    setLoading(m);
    try {
      if (m === "card") {
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            driverId: booking.driverId,
            hours: booking.hours,
            unit: booking.unit,
            bookingId: booking.id,
          }),
        });
        const data = await res.json();
        if (data.mode === "stripe" && data.url) {
          window.location.href = data.url; // real Stripe Checkout
          return;
        }
        await markPaid();
      } else {
        // PayPal / crypto / cash — simulated in demo, then mark the booking paid.
        await new Promise((r) => setTimeout(r, 900));
        await markPaid();
      }
      setDone(m);
      setTimeout(() => {
        onPaid();
        onClose();
      }, 1400);
    } catch {
      setLoading(null);
    }
  };

  const methods: { id: Method; icon: typeof CreditCard; label: string; desc: string }[] = [
    { id: "card", icon: CreditCard, label: t("pay.card"), desc: t("pay.cardDesc") },
    { id: "paypal", icon: Wallet, label: "PayPal", desc: t("pay.paypalDesc") },
    { id: "crypto", icon: Bitcoin, label: t("pay.crypto"), desc: t("pay.cryptoDesc") },
    { id: "cash", icon: Banknote, label: t("pay.cash"), desc: t("pay.cashDesc") },
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[90] grid place-items-end bg-black/60 backdrop-blur-sm sm:place-items-center"
      >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-t-3xl glass-strong p-6 shadow-card sm:rounded-3xl"
        >
          {done ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 18 }}
                className="grid h-16 w-16 place-items-center rounded-full bg-emerald-400/15 text-emerald-400"
              >
                <CheckCircle2 className="h-8 w-8" />
              </motion.span>
              <h3 className="mt-5 text-xl font-semibold text-white">
                {done === "cash" ? t("pay.cashDoneTitle") : t("pay.successTitle")}
              </h3>
              <p className="mt-2 max-w-xs text-sm text-white/60">
                {done === "cash" ? t("pay.cashDoneText") : t("pay.successText")}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">{t("pay.title")}</h3>
                  <p className="mt-0.5 text-sm text-white/50">
                    {t("pay.amount")} ·{" "}
                    <span className="font-semibold text-white">€{booking.total}</span>
                  </p>
                </div>
                <button
                  onClick={onClose}
                  aria-label={t("pay.close")}
                  className="grid h-8 w-8 place-items-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 space-y-2">
                {methods.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => pay(m.id)}
                    disabled={loading !== null}
                    className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-left transition hover:border-royal-400/40 hover:bg-white/[0.05] disabled:opacity-50"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-royal-300">
                      {loading === m.id ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <m.icon className="h-5 w-5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-white">{m.label}</span>
                      <span className="block truncate text-xs text-white/45">{m.desc}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
                  </button>
                ))}
              </div>

              <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-white/40">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                {t("pay.secure")}
              </p>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
