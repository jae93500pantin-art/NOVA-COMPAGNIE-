"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { Search, MapPin, Calendar } from "lucide-react";
import { cities } from "@/lib/cities";
import { todayISODate } from "@/lib/bookings";
import { useI18n } from "@/lib/i18n";
import { DatePicker } from "./DatePicker";

export function SearchBar() {
  const router = useRouter();
  const { t } = useI18n();
  const today = todayISODate();
  const [city, setCity] = useState("paris");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // Remember the chosen date(s) so the booking widget can prefill them.
    try {
      if (rangeStart) sessionStorage.setItem("jw_booking_date", rangeStart);
      else sessionStorage.removeItem("jw_booking_date");
      if (rangeEnd) sessionStorage.setItem("jw_booking_end", rangeEnd);
      else sessionStorage.removeItem("jw_booking_end");
      // No time in the home search — drop any slot left by the transfer form.
      sessionStorage.removeItem("jw_booking_time");
    } catch {
      /* ignore */
    }
    const params = new URLSearchParams();
    params.set("city", city);
    router.push(`/drivers?${params.toString()}`);
  };

  return (
    <motion.form
      onSubmit={submit}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-2 rounded-3xl glass-strong p-3 shadow-card"
    >
      <Field icon={<MapPin className="h-4 w-4 text-royal-400" />} label={t("search.city")}>
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="w-full bg-transparent text-sm font-medium text-white outline-none [&>option]:text-ink-900"
        >
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}, {c.country}
            </option>
          ))}
        </select>
      </Field>

      <Field icon={<Calendar className="h-4 w-4 text-royal-400" />} label={t("search.date")}>
        <DatePicker
          date={rangeStart}
          time=""
          endDate={rangeEnd}
          mode="range"
          min={today}
          variant="search"
          showTime={false}
          onRangeChange={(s, e) => {
            setRangeStart(s);
            setRangeEnd(e);
          }}
        />
      </Field>

      <button
        type="submit"
        className="btn-primary mt-1 min-h-[52px] w-full px-7 text-sm"
      >
        <Search className="h-4 w-4" />
        {t("search.cta")}
      </button>
    </motion.form>
  );
}

function Field({
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
        <p className="text-[11px] uppercase tracking-wider text-white/40">
          {label}
        </p>
        {children}
      </div>
    </div>
  );
}
