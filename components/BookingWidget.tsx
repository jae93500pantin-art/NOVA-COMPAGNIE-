"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  CheckCircle2,
  ShieldCheck,
  Loader2,
  AlertCircle,
  Plane,
} from "lucide-react";
import type { Driver } from "@/lib/types";
import { computeAmount, type BookingUnit } from "@/lib/payments";
import { composeWhen, isFutureBooking, todayISODate } from "@/lib/bookings";
import { whatsappUrl } from "@/lib/whatsapp";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { DatePicker } from "./DatePicker";
import { getClientId, rememberBookedDriver } from "@/lib/clientBookings";
import {
  transferDestinations,
  transferDestinationLabel,
  transferFareForDriver,
} from "@/lib/transfer";
import {
  DEFAULT_SCHEDULE,
  isWithinSchedule,
  type WeeklySchedule,
} from "@/lib/schedule";
import {
  applyDriverOverrides,
  DRIVER_OVERRIDES_EVENT,
} from "@/lib/driverOverrides";

/** Session keys carrying the slot chosen upstream (home search / transfer). */
const PREFILL_KEY = "jw_booking_date";
const PREFILL_TIME_KEY = "jw_booking_time";
/** Destination carried over from the airport-transfer estimate. */
const PREFILL_TRANSFER_KEY = "jw_booking_transfer";

const units: BookingUnit[] = ["hour", "day", "transfer"];

export function BookingWidget({ driver: base }: { driver: Driver }) {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();
  const today = todayISODate();

  /**
   * The driver merged with their own profile edits. The public page is
   * statically generated, so without this the card would quote the build-time
   * rate — and a premium driver who set 220 €/h would be shown, and charged,
   * the old one. Starts from the prop to keep the first render identical to
   * the server's; localStorage is read after mount.
   */
  const [driver, setDriver] = useState<Driver>(base);
  useEffect(() => {
    const sync = () => setDriver(applyDriverOverrides(base));
    sync();
    window.addEventListener(DRIVER_OVERRIDES_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(DRIVER_OVERRIDES_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [base]);

  const [unit, setUnit] = useState<BookingUnit>("hour");
  const [hours, setHours] = useState(3);
  const [date, setDate] = useState(today);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [time, setTime] = useState("");
  // Destinations this driver ticked in their profile — the only ones bookable.
  const servedDestinations = useMemo(
    () =>
      transferDestinations.filter((d) =>
        (driver.transferDestinations ?? []).includes(d.id)
      ),
    [driver.transferDestinations]
  );
  const [transfer, setTransfer] = useState(servedDestinations[0]?.id ?? "");
  const schedule: WeeklySchedule = driver.schedule ?? DEFAULT_SCHEDULE;
  const transferFare = transferFareForDriver(driver);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill the date(s) + pickup time from the upstream form (home search bar
  // or airport-transfer estimate) carried in sessionStorage.
  useEffect(() => {
    try {
      const isValid = (s: string | null) =>
        !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && s >= today;
      const start = sessionStorage.getItem(PREFILL_KEY);
      const end = sessionStorage.getItem("jw_booking_end");
      const at = sessionStorage.getItem(PREFILL_TIME_KEY);
      if (isValid(start)) {
        setDate(start as string);
        if (isValid(end) && end !== start) {
          setUnit("day");
          setRangeStart(start as string);
          setRangeEnd(end as string);
        }
      }
      if (at && /^\d{2}:\d{2}$/.test(at)) setTime(at);
      // Coming from the airport-transfer estimate: open straight on the flat
      // fare for the destination the client already chose there.
      const dest = sessionStorage.getItem(PREFILL_TRANSFER_KEY);
      if (dest && servedDestinations.some((d) => d.id === dest)) {
        setUnit("transfer");
        setHours(1);
        setTransfer(dest);
      }
    } catch {
      /* ignore */
    }
  }, [today, servedDestinations]);

  const daysCount = rangeStart
    ? daysBetween(rangeStart, rangeEnd || rangeStart)
    : 1;
  const effectiveStart = unit === "day" ? rangeStart : date;
  const quantity = unit === "day" ? daysCount : unit === "transfer" ? 1 : hours;
  const { subtotal, total } = computeAmount(
    driver.pricePerHour,
    driver.pricePerDay,
    unit,
    quantity,
    transferFare
  );

  const unitRate = unit === "day" ? driver.pricePerDay : driver.pricePerHour;
  const unitShort = unit === "day" ? t("booking.dayShort") : "h";

  /** The route the flat fare applies to — replaces the hourly line. */
  const chosenDestination = servedDestinations.find((d) => d.id === transfer);

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
    if (unit === "transfer" && !transfer) {
      setError(t("booking.transferNone"));
      return;
    }
    const effectiveTime = unit === "day" ? "" : time;
    if (!isFutureBooking(effectiveStart, effectiveTime)) {
      setError(t("booking.pastError"));
      return;
    }
    // The picker blocks closed days, but a prefilled slot (home search bar,
    // transfer estimate) can still land outside this driver's hours.
    if (!isWithinSchedule(schedule, effectiveStart, effectiveTime)) {
      setError(t("booking.outsideHoursError"));
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
          transfer: unit === "transfer" ? transfer : undefined,
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
          <p className="mt-1 text-xs text-white/50">
            <strong className="font-medium text-white/80">
              €{driver.pricePerDay}
            </strong>{" "}
            {t("drivers.perDay")}
          </p>
          <p className="mt-0.5 text-[11px] text-white/35">
            {t("booking.taxIncluded")}
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

      {/* Hour / day / airport-transfer toggle */}
      <div className="mt-5 grid grid-cols-3 gap-2">
        {units.map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => {
              setUnit(u);
              setHours(u === "hour" ? 3 : 1);
              setError(null);
            }}
            className={`rounded-xl border px-2 py-2 text-[13px] font-medium leading-tight transition ${
              unit === u
                ? "border-royal-400/50 bg-royal-500/20 text-white"
                : "border-white/10 text-white/60 hover:bg-white/5"
            }`}
          >
            {u === "day"
              ? t("booking.byDay")
              : u === "transfer"
              ? t("booking.byTransfer")
              : t("booking.byHour")}
          </button>
        ))}
      </div>

      {/* Transfer destination — only those this driver actually serves */}
      {unit === "transfer" && (
        <div className="mt-3 rounded-xl border border-white/10 px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-[11px] text-white/40">
            <Plane className="h-3 w-3" /> {t("booking.transferTo")}
          </span>
          {servedDestinations.length > 0 ? (
            <select
              value={transfer}
              onChange={(e) => {
                setTransfer(e.target.value);
                setError(null);
              }}
              className="mt-0.5 w-full bg-transparent text-sm font-medium text-white outline-none [&>option]:text-ink-900"
            >
              {servedDestinations.map((d) => (
                <option key={d.id} value={d.id}>
                  {transferDestinationLabel(d)}
                </option>
              ))}
            </select>
          ) : (
            <p className="mt-0.5 text-sm text-white/50">
              {t("booking.transferNone")}
            </p>
          )}
        </div>
      )}

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
            min={today}
            variant="booking"
            schedule={schedule}
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
        {unit === "transfer" ? (
          // A transfer is a flat fare: no duration, no hourly maths. The route
          // gets its own line — it is far too long for a label/value row.
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-white/60">{t("booking.transferFlat")}</p>
              {chosenDestination && (
                <p className="mt-0.5 text-xs leading-relaxed text-white/40">
                  {transferDestinationLabel(chosenDestination)}
                </p>
              )}
            </div>
            <span className="shrink-0 text-white">€{subtotal}</span>
          </div>
        ) : (
          <Row
            label={`€${unitRate} × ${quantity} ${unitShort}`}
            value={`€${subtotal}`}
          />
        )}
        <div className="my-2 h-px bg-white/10" />
        <Row label={t("booking.total")} value={`€${total}`} bold />
      </div>

      {/* Week bookings are never priced online — they go through support. */}
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-sm font-medium text-white">
          {t("booking.weekQuoteTitle")}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-white/40">
          {t("booking.weekQuoteText")}
        </p>
        <a
          href={whatsappUrl(
            `Bonjour, je souhaite obtenir un devis pour une réservation à la semaine avec ${driver.firstName} ${driver.lastName} (${driver.car.make} ${driver.car.model}).`
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost mt-3 w-full text-sm"
        >
          <MessageCircle className="h-4 w-4 text-emerald-400" />
          {t("booking.weekQuoteCta")}
        </a>
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
