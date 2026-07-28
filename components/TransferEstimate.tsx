"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Plane, MapPin, Car, ArrowRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { formatPrice } from "@/lib/utils";
import {
  airports,
  zones,
  vehicles,
  estimateTransfer,
  getAirport,
} from "@/lib/transfer";

export function TransferEstimate() {
  const { t } = useI18n();
  const router = useRouter();
  const [airport, setAirport] = useState<string>(airports[0].id);
  const [zone, setZone] = useState<string>(zones[0].id);
  const [vehicle, setVehicle] = useState<string>(vehicles[0].id);

  const price = useMemo(
    () => estimateTransfer(airport, zone, vehicle),
    [airport, zone, vehicle]
  );

  const book = () => {
    const cityId = getAirport(airport)?.cityId ?? "paris";
    router.push(`/drivers?city=${cityId}`);
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
          <p className="mt-3 text-xs leading-relaxed text-white/45">
            {t("transfer.estNote")}
          </p>
        </div>
        <button onClick={book} className="btn-primary mt-6 w-full text-sm">
          {t("transfer.estCta")}
          <ArrowRight className="h-4 w-4" />
        </button>
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
