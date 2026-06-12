"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { Search, MapPin, Calendar, ChevronDown } from "lucide-react";
import { cities } from "@/lib/cities";

export function SearchBar() {
  const router = useRouter();
  const [city, setCity] = useState("paris");
  const [category, setCategory] = useState("all");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    params.set("city", city);
    if (category !== "all") params.set("category", category);
    router.push(`/drivers?${params.toString()}`);
  };

  return (
    <motion.form
      onSubmit={submit}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="grid gap-2 rounded-3xl glass-strong p-2 shadow-card sm:grid-cols-[1.2fr_1fr_1fr_auto]"
    >
      <Field icon={<MapPin className="h-4 w-4 text-royal-400" />} label="Ville">
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

      <Field icon={<ChevronDown className="h-4 w-4 text-royal-400" />} label="Catégorie">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full bg-transparent text-sm font-medium text-white outline-none [&>option]:text-ink-900"
        >
          <option value="all">Toutes catégories</option>
          <option value="Business">Business</option>
          <option value="Luxury">Luxury</option>
          <option value="SUV">SUV</option>
          <option value="Van">Van</option>
          <option value="Electric">Électrique</option>
        </select>
      </Field>

      <Field icon={<Calendar className="h-4 w-4 text-royal-400" />} label="Date">
        <span className="text-sm font-medium text-white/80">Aujourd'hui</span>
      </Field>

      <button
        type="submit"
        className="btn-primary h-full min-h-[56px] px-7 text-sm"
      >
        <Search className="h-4 w-4" />
        Rechercher
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
    <div className="flex items-center gap-3 rounded-2xl px-4 py-3 transition hover:bg-white/[0.03]">
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
