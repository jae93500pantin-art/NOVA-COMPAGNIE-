"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  CheckCircle2,
  ShieldCheck,
  Calendar,
  Clock,
  Loader2,
  AlertCircle,
} from "lucide-react";
import type { Driver } from "@/lib/types";
import { addContact } from "@/lib/contacts";
import { computeBookingAmount } from "@/lib/payments";
import { useAuth } from "@/lib/auth";
import { getClientId, rememberBookedDriver } from "@/lib/clientBookings";

export function BookingWidget({ driver }: { driver: Driver }) {
  const router = useRouter();
  const { user } = useAuth();
  const [hours, setHours] = useState(3);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { subtotal, serviceFee, total } = computeBookingAmount(
    driver.pricePerHour,
    hours
  );

  const contact = () => {
    addContact(driver.id);
    router.push(`/messages?driver=${driver.id}`);
  };

  const reserve = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1) Create a real-time course request the driver receives instantly.
      const clientId = getClientId();
      await fetch(`/api/bookings/${driver.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          clientName: user ? `${user.firstName} ${user.lastName}`.trim() : "Client",
          hours,
        }),
      });
      rememberBookedDriver(driver.id);

      // 2) Payment: Stripe Checkout when configured, otherwise demo confirmation.
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId: driver.id, hours }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Erreur");
      if (data.mode === "stripe" && data.url) {
        window.location.href = data.url;
        return;
      }
      setConfirmed(true);
    } catch {
      setError("La réservation n'a pas pu être envoyée. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sticky top-28 rounded-3xl glass-strong p-6 shadow-card">
      <div className="flex items-end justify-between">
        <div>
          <span className="text-3xl font-semibold text-white">
            €{driver.pricePerHour}
          </span>
          <span className="text-sm text-white/50"> / heure</span>
        </div>
        <span
          className={`chip ${
            driver.available
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
              : "text-white/50"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              driver.available ? "bg-emerald-400" : "bg-white/40"
            }`}
          />
          {driver.available ? "Disponible maintenant" : "Sur réservation"}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-white/10 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[11px] text-white/40">
            <Calendar className="h-3 w-3" /> Date
          </p>
          <p className="mt-0.5 text-sm font-medium text-white">Aujourd'hui</p>
        </div>
        <div className="rounded-xl border border-white/10 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[11px] text-white/40">
            <Clock className="h-3 w-3" /> Départ
          </p>
          <p className="mt-0.5 text-sm font-medium text-white">14:30</p>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-white/10 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-white/60">Durée estimée</span>
          <span className="text-sm font-medium text-white">{hours} h</span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="mt-2 w-full accent-royal-500"
        />
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <Row label={`€${driver.pricePerHour} × ${hours} h`} value={`€${subtotal}`} />
        <Row label="Frais de service" value={`€${serviceFee}`} muted />
        <div className="my-2 h-px bg-white/10" />
        <Row label="Total" value={`€${total}`} bold />
      </div>

      <AnimatePresence mode="wait">
        {confirmed ? (
          <motion.div
            key="confirmed"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-5 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-center"
          >
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
            <p className="mt-2 text-sm font-semibold text-white">
              Demande envoyée !
            </p>
            <p className="mt-1 text-xs text-white/60">
              {driver.firstName} vous répondra sous {driver.responseTime}.
            </p>
            <button
              onClick={contact}
              className="mt-3 inline-block text-xs font-medium text-emerald-300 hover:underline"
            >
              Suivre la conversation →
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="actions"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-5 space-y-2"
          >
            {error && (
              <p className="flex items-center gap-1.5 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}
            <button
              onClick={reserve}
              disabled={loading}
              className="btn-primary w-full disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Redirection…" : "Réserver"}
            </button>
            <button onClick={contact} className="btn-ghost w-full">
              <MessageCircle className="h-4 w-4" />
              Contacter
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-white/40">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
        Aucun débit avant confirmation du chauffeur
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-white/40" : "text-white/60"}>{label}</span>
      <span
        className={
          bold ? "text-base font-semibold text-white" : "font-medium text-white/80"
        }
      >
        {value}
      </span>
    </div>
  );
}
