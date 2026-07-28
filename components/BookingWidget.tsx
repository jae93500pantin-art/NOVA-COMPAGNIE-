"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  CheckCircle2,
  ShieldCheck,
  Loader2,
  AlertCircle,
} from "lucide-react";
import type { Driver } from "@/lib/types";
import { computeAmount, type BookingUnit } from "@/lib/payments";
import { composeWhen, isFutureBooking, todayISODate } from "@/lib/bookings";
import { whatsappUrl } from "@/lib/whatsapp";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { DatePicker } from "./DatePicker";
import { getClientId, rememberBookedDriver } from "@/lib/clientBookings";

/** Session key used to carry the date chosen in the home search bar. */
const PREFILL_KEY = "jw_booking_date";

export function BookingWidget({ driver }: { driver: Driver }) {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();
  const today = todayISODate();
  const [unit, setUnit] = useState<BookingUnit>("hour");
  const [hours, setHours] = useState(3);
  const [date, setDate] = useState(today);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [time, setTime] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill the date(s) from the home search (sessionStorage) when present.
  useEffect(() => {
    try {
      const isValid = (s: string | null) =>
        !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && s >= today;
      const start = sessionStorage.getItem(PREFILL_KEY);
      const end = sessionStorage.getItem("jw_booking_end");
      if (isValid(start)) {
        setDate(start as string);
        if (isValid(end) && end !== start) {
          setUnit("day");
          setRangeStart(start as string);
          setRangeEnd(end as string);
        }
      }
    } catch {
      /* ignore */
    }
  }, [today]);

  const daysCount = rangeStart
    ? daysBetween(rangeStart, rangeEnd || rangeStart)
    : 1;
  const effectiveStart = unit === "day" ? rangeStart : date;
  const quantity = unit === "day" ? daysCount : hours;
  const { subtotal, total } = computeAmount(
    driver.pricePerHour,
    driver.pricePerDay,
    unit,
    quantity
  );

  const unitRate = unit === "day" ? driver.pricePerDay : driver.pricePerHour;
  const unitShort = unit === "day" ? t("booking.dayShort") : "h";

  const contact = () => {
    window.open(
      whatsappUrl(
        `Bonjour, je souhaite contacter ${driver.firstName} (${driver.car.make} ${driver.car.model}).`
      ),
      "_blank",
      "noopener,noreferrer"
    );
  };

  const reserve = async () => {
    if (!user) {
      router.push("/auth/login");
      return;
    }
    if (!isFutureBooking(effectiveStart, unit === "day" ? "" : time)) {
      setError(t("booking.pastError"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Send a course request. Payment happens later, only after the driver
      // accepts — tracked from "Mes réservations".
      const clientId = getClientId();
      const res = await fetch(`/api/bookings/${driver.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          clientName: `${user.firstName} ${user.lastName}`.trim() || "Client",
          clientEmail: user.email ?? "",
          hours: quantity,
          unit,
          when: composeWhen(effectiveStart, unit === "day" ? "" : time),
        }),
      });
      if (!res.ok) throw new Error("Erreur");
      rememberBookedDriver(driver.id);
      setConfirmed(true);
    } catch {
      setError(t("booking.sendError"));
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
          <span className="text-sm text-white/50"> {t("booking.perHour")}</span>
          <p className="mt-1 text-xs text-white/40">
            €{driver.pricePerDay} {t("drivers.perDay")} · {t("drivers.quoteWeek")}
          </p>
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
          {driver.available ? t("booking.availableNow") : t("booking.onRequest")}
        </span>
      </div>

      {/* Hour / day toggle */}
      <div className="mt-5 grid grid-cols-2 gap-2">
        {(["hour", "day"] as BookingUnit[]).map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => {
              setUnit(u);
              setHours(u === "day" ? 1 : 3);
            }}
            className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
              unit === u
                ? "border-royal-400/50 bg-royal-500/20 text-white"
                : "border-white/10 text-white/60 hover:bg-white/5"
            }`}
          >
            {u === "day" ? t("booking.byDay") : t("booking.byHour")}
          </button>
        ))}
      </div>

      {/* Date(s) */}
      <div className="mt-3 space-y-2">
        {unit === "day" ? (
          <>
            <DatePicker
              date={rangeStart}
              time=""
              endDate={rangeEnd}
              mode="range"
              showTime={false}
              min={today}
              variant="booking"
              onRangeChange={(s, e) => {
                setRangeStart(s);
                setRangeEnd(e);
                setError(null);
              }}
            />
            <p className="pt-1 text-xs text-white/50">
              {daysCount} {daysCount > 1 ? t("booking.days") : t("booking.day")}
            </p>
          </>
        ) : (
          <DatePicker
            date={date}
            time={time}
            showTime={false}
            min={today}
            variant="booking"
            onChange={(d, tm) => {
              setDate(d);
              setTime(tm);
              setError(null);
            }}
          />
        )}
      </div>

      {/* Hours slider (hour mode only) */}
      {unit === "hour" && (
        <div className="mt-3 rounded-xl border border-white/10 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">{t("booking.duration")}</span>
            <span className="text-sm font-medium text-white">
              {hours} {unitShort}
            </span>
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
      )}

      <div className="mt-4 space-y-2 text-sm">
        <Row label={`€${unitRate} × ${quantity} ${unitShort}`} value={`€${subtotal}`} />
        <div className="my-2 h-px bg-white/10" />
        <Row label={t("booking.total")} value={`€${total}`} bold />
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
              {t("booking.sent")}
            </p>
            <p className="mt-1 text-xs text-white/60">
              {driver.firstName} {t("booking.sentDetailA")}
            </p>
            <button
              onClick={() => router.push("/compte/reservations")}
              className="btn-primary mt-3 w-full text-sm"
            >
              {t("booking.follow")}
            </button>
            <button
              onClick={contact}
              className="mt-2 inline-block text-xs font-medium text-emerald-300 hover:underline"
            >
              {t("booking.contactDriver")}
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
              {loading ? t("booking.sending") : t("booking.request")}
            </button>
            <button onClick={contact} className="btn-ghost w-full">
              <MessageCircle className="h-4 w-4" />
              {t("booking.contact")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-white/40">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
        {t("booking.noCharge")}
      </p>
    </div>
  );
}

/** Inclusive number of days between two ISO dates (min 1). */
function daysBetween(startISO: string, endISO: string): number {
  const s = Date.parse(`${startISO}T00:00:00`);
  const e = Date.parse(`${endISO}T00:00:00`);
  if (Number.isNaN(s) || Number.isNaN(e)) return 1;
  const diff = Math.round((e - s) / 86_400_000);
  return diff >= 0 ? diff + 1 : 1;
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
