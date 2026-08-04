"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plane,
  MapPin,
  Car,
  Calendar,
  ArrowRight,
  AlertCircle,
  MessageCircle,
  Users,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { formatPrice } from "@/lib/utils";
import {
  composeWhen,
  formatWhen,
  isFutureBooking,
  todayISODate,
} from "@/lib/bookings";
import { DatePicker } from "./DatePicker";
import { drivers as allDrivers } from "@/lib/drivers";
import type { Driver } from "@/lib/types";
import {
  applyDriverOverrides,
  DRIVER_OVERRIDES_EVENT,
} from "@/lib/driverOverrides";
import { whatsappUrl } from "@/lib/whatsapp";
import {
  airports,
  zones,
  vehicles,
  estimateTransfer,
  getAirport,
  driversForTransferDestination,
  getTransferDestination,
  transferDestinationLabel,
  zoneDestinationId,
} from "@/lib/transfer";

export function TransferEstimate() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [airport, setAirport] = useState<string>(airports[0].id);
  const [zone, setZone] = useState<string>(zones[0].id);
  const [vehicle, setVehicle] = useState<string>(vehicles[0].id);

  const today = todayISODate();
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [pastError, setPastError] = useState(false);

  const price = useMemo(
    () => estimateTransfer(airport, zone, vehicle),
    [airport, zone, vehicle]
  );

  /**
   * Drivers merged with their own saved settings, so ticking/unticking a
   * destination in the driver profile is reflected here without a reload.
   */
  const [pool, setPool] = useState<Driver[]>(allDrivers);
  useEffect(() => {
    const sync = () => setPool(allDrivers.map(applyDriverOverrides));
    sync();
    window.addEventListener(DRIVER_OVERRIDES_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(DRIVER_OVERRIDES_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // The destination picked in the form drives everything below.
  const destinationId = zoneDestinationId(zone);
  const destination = getTransferDestination(destinationId);
  const eligible = useMemo(
    () => driversForTransferDestination(pool, destinationId),
    [pool, destinationId]
  );

  // Changing the form clears a previous refusal.
  useEffect(() => setBlocked(false), [zone, airport, vehicle]);

  const book = () => {
    // No driver ticked this destination → the booking stops here.
    if (eligible.length === 0) {
      setBlocked(true);
      return;
    }
    if (!isFutureBooking(date, time)) {
      setPastError(true);
      return;
    }
    // Carry the pickup slot to the booking widget (same channel as the home
    // search bar). Strictly-necessary functional storage, cleared on tab close.
    try {
      sessionStorage.setItem("jw_booking_date", date);
      sessionStorage.removeItem("jw_booking_end");
      if (time) sessionStorage.setItem("jw_booking_time", time);
      else sessionStorage.removeItem("jw_booking_time");
    } catch {
      /* ignore */
    }
    const cityId = getAirport(airport)?.cityId ?? "paris";
    router.push(`/drivers?city=${cityId}&transfer=${encodeURIComponent(destinationId)}`);
  };

  return (
    <div className="grid gap-6 rounded-3xl glass-strong p-6 shadow-card lg:grid-cols-[1.2fr_0.8fr] lg:p-8">
      {/* Inputs */}
      <div className="space-y-4">
        <EstField icon={<Plane className="h-4 w-4 text-royal-400" />} label={t("transfer.estFrom")}>
          <select
            value={airport}
            onChange={(e) => setAirport(e.target.value)}
            className="w-full bg-transparent text-sm font-medium text-white outline-none [&>option]:text-ink-900"
          >
            {airports.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.code})
              </option>
            ))}
          </select>
        </EstField>

        <EstField icon={<MapPin className="h-4 w-4 text-royal-400" />} label={t("transfer.estTo")}>
          <select
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            className="w-full bg-transparent text-sm font-medium text-white outline-none [&>option]:text-ink-900"
          >
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {t(`transfer.${z.labelKey}`)}
              </option>
            ))}
          </select>
        </EstField>

        <EstField
          icon={<Calendar className="h-4 w-4 text-royal-400" />}
          label={t("transfer.estWhen")}
        >
          <DatePicker
            date={date}
            time={time}
            min={today}
            variant="search"
            onChange={(d, tm) => {
              setDate(d);
              setTime(tm);
              setPastError(false);
            }}
          />
        </EstField>

        <EstField icon={<Car className="h-4 w-4 text-royal-400" />} label={t("transfer.estVehicle")}>
          <select
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
            className="w-full bg-transparent text-sm font-medium text-white outline-none [&>option]:text-ink-900"
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {t(`transfer.${v.labelKey}`)}
              </option>
            ))}
          </select>
        </EstField>
      </div>

      {/* Result */}
      <div className="flex flex-col justify-between rounded-2xl bg-gradient-to-br from-ink-800 to-ink-900 p-6">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-white/40">
            {t("transfer.estResult")}
          </p>
          <motion.p
            key={price}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="mt-1 text-4xl font-semibold tracking-tight text-white"
          >
            {formatPrice(price)}
          </motion.p>
          <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-white/70">
            <Calendar className="h-3.5 w-3.5 text-royal-400" />
            {formatWhen(composeWhen(date, time), lang)}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-white/45">
            {t("transfer.estNote")}
          </p>
        </div>
        <AnimatePresence mode="wait">
          {blocked ? (
            <motion.div
              key="blocked"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="mt-6 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4"
            >
              <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-200">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {t("transfer.estNoneTitle")}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-amber-100/75">
                {destination
                  ? `${transferDestinationLabel(destination)} — ${t("transfer.estNoneText")}`
                  : t("transfer.estNoneText")}
              </p>
              <a
                href={whatsappUrl(
                  destination
                    ? `Bonjour, je cherche un transfert vers ${transferDestinationLabel(destination)}.`
                    : undefined
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary mt-3 w-full text-sm"
              >
                <MessageCircle className="h-4 w-4" />
                {t("transfer.estSupport")}
              </a>
            </motion.div>
          ) : (
            <motion.div
              key="cta"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-6"
            >
              {pastError && (
                <p className="mb-2 flex items-center gap-1.5 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {t("transfer.estPastError")}
                </p>
              )}
              <button onClick={book} className="btn-primary w-full text-sm">
                {t("transfer.estCta")}
                <ArrowRight className="h-4 w-4" />
              </button>
              {eligible.length > 0 && (
                <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-white/40">
                  <Users className="h-3 w-3 text-emerald-400" />
                  {eligible.length}{" "}
                  {eligible.length > 1
                    ? t("transfer.estAvailableMany")
                    : t("transfer.estAvailableOne")}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function EstField({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 transition hover:border-white/10 hover:bg-white/[0.04]">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/5">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-white/40">{label}</p>
        {children}
      </div>
    </div>
  );
}
