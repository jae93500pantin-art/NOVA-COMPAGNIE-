"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";
import { motion } from "framer-motion";
import { drivers } from "@/lib/drivers";
import { cities } from "@/lib/cities";
import { DriverCard } from "@/components/DriverCard";
import type { VehicleCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

const categories: (VehicleCategory | "Tous")[] = [
  "Tous",
  "Business",
  "Luxury",
  "SUV",
  "Van",
  "Electric",
];

export function DriversExplorer() {
  const params = useSearchParams();
  const [city, setCity] = useState(params.get("city") ?? "all");
  const [category, setCategory] = useState<string>(
    params.get("category") ?? "Tous"
  );
  const [query, setQuery] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [sort, setSort] = useState("rating");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtered = useMemo(() => {
    let list = drivers.filter((d) => {
      if (city !== "all" && d.cityId !== city) return false;
      if (category !== "Tous" && !d.categories.includes(category as VehicleCategory))
        return false;
      if (onlyAvailable && !d.available) return false;
      if (query) {
        const q = query.toLowerCase();
        const hay =
          `${d.firstName} ${d.lastName} ${d.car.make} ${d.car.model}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "rating") return b.rating - a.rating;
      if (sort === "price-asc") return a.pricePerHour - b.pricePerHour;
      if (sort === "price-desc") return b.pricePerHour - a.pricePerHour;
      if (sort === "experience") return b.experienceYears - a.experienceYears;
      return 0;
    });
    return list;
  }, [city, category, query, onlyAvailable, sort]);

  return (
    <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
      {/* Mobile filter toggle */}
      <button
        onClick={() => setFiltersOpen((o) => !o)}
        className="flex items-center justify-between rounded-2xl glass px-5 py-3.5 text-sm font-medium text-white lg:hidden"
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-royal-400" />
          Filtres
        </span>
        <span className="text-xs text-white/50">
          {filtersOpen ? "Masquer" : "Afficher"}
        </span>
      </button>

      {/* Sidebar filters */}
      <aside
        className={cn(
          "h-fit space-y-6 rounded-3xl glass p-6 lg:sticky lg:top-28 lg:block",
          filtersOpen ? "block" : "hidden"
        )}
      >
        <div className="hidden items-center gap-2 text-sm font-semibold text-white lg:flex">
          <SlidersHorizontal className="h-4 w-4 text-royal-400" />
          Filtres
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nom, véhicule…"
            className="input pl-9"
          />
        </div>

        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-white/40">
            Ville
          </p>
          <div className="space-y-1">
            <FilterRow
              active={city === "all"}
              onClick={() => setCity("all")}
              label="Toutes les villes"
              count={drivers.length}
            />
            {cities.map((c) => (
              <FilterRow
                key={c.id}
                active={city === c.id}
                onClick={() => setCity(c.id)}
                label={c.name}
                count={drivers.filter((d) => d.cityId === c.id).length}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-white/40">
            Catégorie
          </p>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  category === c
                    ? "border-royal-400/50 bg-royal-500/20 text-white"
                    : "border-white/10 text-white/60 hover:bg-white/5"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <label className="flex cursor-pointer items-center justify-between rounded-xl bg-white/[0.03] px-4 py-3">
          <span className="text-sm text-white/70">Disponibles uniquement</span>
          <span
            onClick={() => setOnlyAvailable((v) => !v)}
            className={cn(
              "relative h-6 w-11 rounded-full transition",
              onlyAvailable ? "bg-royal-500" : "bg-white/10"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
                onlyAvailable ? "left-[22px]" : "left-0.5"
              )}
            />
          </span>
        </label>
      </aside>

      {/* Results */}
      <div>
        <div className="mb-6 flex items-center justify-between gap-4">
          <p className="text-sm text-white/50">
            <span className="font-semibold text-white">{filtered.length}</span>{" "}
            chauffeur{filtered.length > 1 ? "s" : ""} trouvé
            {filtered.length > 1 ? "s" : ""}
          </p>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white outline-none [&>option]:text-ink-900"
          >
            <option value="rating">Mieux notés</option>
            <option value="price-asc">Prix croissant</option>
            <option value="price-desc">Prix décroissant</option>
            <option value="experience">Plus d'expérience</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid place-items-center rounded-3xl glass p-16 text-center"
          >
            <p className="text-lg font-semibold text-white">
              Aucun chauffeur trouvé
            </p>
            <p className="mt-2 text-sm text-white/50">
              Essayez d'élargir vos critères de recherche.
            </p>
          </motion.div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((d, i) => (
              <DriverCard key={d.id} driver={d} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterRow({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition",
        active ? "bg-white/[0.06] text-white" : "text-white/60 hover:bg-white/5"
      )}
    >
      <span>{label}</span>
      <span className="text-xs text-white/30">{count}</span>
    </button>
  );
}
