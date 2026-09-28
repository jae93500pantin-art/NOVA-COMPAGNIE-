"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessageCircle, Plane, Search, SlidersHorizontal, X } from "lucide-react";
import { motion } from "framer-motion";
import { cities } from "@/lib/cities";
import { DriverCard } from "@/components/DriverCard";
import type { Driver, VehicleCategory } from "@/lib/types";
import {
  driverServesTransferDestination,
  getTransferDestination,
  isKnownTransferDestination,
  transferDestinationLabel,
  transferDestinations,
  driverHasTransferVehicle,
  getVehicle,
} from "@/lib/transfer";
import { isWithinScheduleRange } from "@/lib/schedule";
import { composeSlot, formatSlot } from "@/lib/calendar";
import {
  applyDriverOverrides,
  DRIVER_OVERRIDES_EVENT,
  scheduleOf,
} from "@/lib/driverOverrides";
import { whatsappUrl } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const categories: (VehicleCategory | "Tous")[] = [
  "Tous",
  "Business",
  "Van",
  "Van Luxury",
  "Luxury",
  "Moto",
];

/**
 * L'annuaire vient du serveur : `lib/drivers.ts` est vide et la vraie source
 * est `public.drivers`, lue avec le service role (voir `lib/driverDirectory`).
 * Ce composant est client — il ne peut pas interroger la base lui-même, la
 * page la lui passe.
 */
export function DriversExplorer({ drivers = [] }: { drivers?: Driver[] }) {
  const params = useSearchParams();
  const { t, lang } = useI18n();
  const [city, setCity] = useState(params.get("city") ?? "all");
  const [category, setCategory] = useState<string>(
    params.get("category") ?? "Tous"
  );
  const urlTransfer = params.get("transfer") ?? "";
  const [transfer, setTransfer] = useState(
    isKnownTransferDestination(urlTransfer) ? urlTransfer : ""
  );
  // Vehicle class carried over from the transfer estimate — same strict filter.
  const urlVehicle = params.get("vehicle") ?? "";
  const [vehicle, setVehicle] = useState(
    getVehicle(urlVehicle) ? urlVehicle : ""
  );
  /**
   * Creneau recherche, depuis la carte d'accueil (?date=&time=).
   *
   * ⚠️ C'est un FILTRE, pas une reservation : il ne retient que les chauffeurs
   * dont le planning declare couvre ce moment. Rien n'est bloque ni engage.
   * L'heure est facultative — une date seule ne demande que le jour ouvert.
   */
  const [slotDate, setSlotDate] = useState(params.get("date") ?? "");
  const [slotEnd, setSlotEnd] = useState(params.get("dateEnd") ?? "");
  const [slotTime, setSlotTime] = useState(params.get("time") ?? "");
  const [query, setQuery] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  // ⚠️ Plus de filtre « note minimum » ni de tri par note : il n y a plus de
  // note. Le tri par défaut passe donc à l expérience déclarée.
  const [sort, setSort] = useState("experience");
  const [filtersOpen, setFiltersOpen] = useState(false);

  /**
   * Drivers merged with their own saved settings, so a transfer destination
   * ticked/unticked in the driver profile changes this listing without a
   * reload. Runs after mount — localStorage is client-only.
   */
  const [pool, setPool] = useState<Driver[]>(drivers);
  useEffect(() => {
    const sync = () => setPool(drivers.map(applyDriverOverrides));
    sync();
    window.addEventListener(DRIVER_OVERRIDES_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(DRIVER_OVERRIDES_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [drivers]);

  const transferDestination = getTransferDestination(transfer);

  /**
   * Libellé du créneau recherché : « 29 septembre 2026 à 04:35 », ou
   * « 29 septembre 2026 → 2 octobre 2026 à 04:35 » sur plusieurs jours.
   *
   * ⚠️ L'heure est collée à la FIN, une seule fois : elle vaut pour chaque jour
   * de la plage, et la répéter sur les deux bornes laisserait croire à un
   * départ le premier jour et un retour le dernier.
   */
  const slotLabel = slotEnd
    ? `${formatSlot(slotDate, lang)} → ${formatSlot(
        composeSlot(slotEnd, slotTime),
        lang
      )}`
    : formatSlot(composeSlot(slotDate, slotTime), lang);

  /** Nobody ticked this destination → the transfer booking must stop here. */
  const transferUnserved = useMemo(
    () =>
      isKnownTransferDestination(transfer) &&
      !pool.some((d) => driverServesTransferDestination(d, transfer)),
    [pool, transfer]
  );

  const filtered = useMemo(() => {
    let list = pool.filter((d) => {
      if (city !== "all" && d.cityId !== city) return false;
      if (category !== "Tous" && !d.categories.includes(category as VehicleCategory))
        return false;
      if (!driverServesTransferDestination(d, transfer)) return false;
      if (!driverHasTransferVehicle(d, vehicle)) return false;
      if (onlyAvailable && !d.available) return false;
      // ⚠️ `scheduleOf` retombe sur DEFAULT_SCHEDULE (aucune contrainte) pour un
      // chauffeur qui n'a rien declare : il reste donc visible sur tous les
      // creneaux. C'est voulu — l'absence de planning n'est pas une
      // indisponibilite, et exclure ces profils viderait l'annuaire.
      if (
        slotDate &&
        !isWithinScheduleRange(scheduleOf(d), slotDate, slotEnd, slotTime)
      )
        return false;
      if (query) {
        const q = query.toLowerCase();
        const hay =
          `${d.firstName} ${d.lastName} ${d.car.make} ${d.car.model}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      // Hors ligne ne veut pas dire injoignable : l'interrupteur ne parle que
      // de maintenant, alors qu'on peut convenir d'une course pour plus tard.
      // On ne cache donc pas ces profils — on les fait passer après ceux qui
      // repondent tout de suite. (Le filtre « Disponibles uniquement » reste
      // là pour qui ne veut vraiment qu'eux.)
      if (a.available !== b.available) return a.available ? -1 : 1;
      if (sort === "experience") return b.experienceYears - a.experienceYears;
      // Le tri porte sur le TARIF CHAUFFEUR affiche sur la carte. Trier sur le
      // total client donnerait exactement le meme ordre (les 5 pourcent sont
      // proportionnels) tout en obligeant a recalculer a chaque comparaison.
      if (sort === "priceAsc") return a.pricePerHour - b.pricePerHour;
      if (sort === "priceDesc") return b.pricePerHour - a.pricePerHour;
      return 0;
    });
    return list;
  }, [
    pool,
    city,
    category,
    transfer,
    vehicle,
    query,
    onlyAvailable,
    slotDate,
    slotEnd,
    slotTime,
    sort,
  ]);

  return (
    <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
      {/* Mobile filter toggle */}
      <button
        onClick={() => setFiltersOpen((o) => !o)}
        className="flex items-center justify-between rounded-2xl glass px-5 py-3.5 text-sm font-medium text-white lg:hidden"
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-royal-400" />
          {t("drivers.filters")}
        </span>
        <span className="text-xs text-white/50">
          {filtersOpen ? t("drivers.hide") : t("drivers.show")}
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
          {t("drivers.filters")}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("drivers.searchPlaceholder")}
            className="input pl-9"
          />
        </div>

        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-white/40">
            {t("drivers.city")}
          </p>
          <div className="space-y-1">
            <FilterRow
              active={city === "all"}
              onClick={() => setCity("all")}
              label={t("drivers.allCities")}
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
          <p className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wider text-white/40">
            <Plane className="h-3 w-3 text-royal-400" />
            {t("drivers.transferFilter")}
          </p>
          <select
            value={transfer}
            onChange={(e) => setTransfer(e.target.value)}
            className="input [&>option]:text-ink-900"
          >
            <option value="">{t("drivers.allTransfers")}</option>
            {transferDestinations.map((d) => {
              const count = pool.filter((dr) =>
                driverServesTransferDestination(dr, d.id)
              ).length;
              return (
                <option key={d.id} value={d.id}>
                  {transferDestinationLabel(d)} ({count})
                </option>
              );
            })}
          </select>
        </div>

        {/* Creneau recherche, seulement quand il vient de l'accueil. Meme regle
            que pour la classe : un filtre invisible est un filtre que le
            visiteur ne peut pas defaire. */}
        {slotDate && (
          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-white/40">
              {t("drivers.slotFilter")}
            </p>
            <button
              onClick={() => {
                setSlotDate("");
                setSlotEnd("");
                setSlotTime("");
              }}
              className="flex w-full items-center justify-between rounded-xl border border-royal-400/50 bg-royal-500/20 px-3 py-2 text-sm text-white transition hover:bg-royal-500/30"
            >
              <span>{slotLabel}</span>
              <X className="h-3.5 w-3.5 text-white/60" />
            </button>
            <p className="mt-1.5 text-[11px] leading-relaxed text-white/35">
              {t("drivers.slotNote")}
            </p>
          </div>
        )}

        {/* Vehicle class, only when carried over from the transfer estimate —
            an invisible filter is a filter the visitor cannot undo. */}
        {vehicle && (
          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-white/40">
              {t("transfer.estVehicle")}
            </p>
            <button
              onClick={() => setVehicle("")}
              className="flex w-full items-center justify-between rounded-xl border border-royal-400/50 bg-royal-500/20 px-3 py-2 text-sm text-white transition hover:bg-royal-500/30"
            >
              <span>{t(`transfer.${getVehicle(vehicle)?.labelKey}`)}</span>
              <X className="h-3.5 w-3.5 text-white/60" />
            </button>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-white/40">
            {t("drivers.category")}
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
                {c === "Tous" ? t("drivers.all") : c}
              </button>
            ))}
          </div>
        </div>

        <label className="flex cursor-pointer items-center justify-between rounded-xl bg-white/[0.03] px-4 py-3">
          <span className="text-sm text-white/70">{t("drivers.availableOnly")}</span>
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
            {filtered.length > 1 ? t("drivers.resultsMany") : t("drivers.resultsOne")}
          </p>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white outline-none [&>option]:text-ink-900"
          >
            <option value="experience">{t("drivers.sortExperience")}</option>
            <option value="priceAsc">{t("drivers.sortPriceAsc")}</option>
            <option value="priceDesc">{t("drivers.sortPriceDesc")}</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid place-items-center rounded-3xl glass p-16 text-center"
          >
            {transferUnserved ? (
              <>
                <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-amber-400/10 text-amber-300">
                  <Plane className="h-5 w-5" />
                </span>
                <p className="text-lg font-semibold text-white">
                  {t("drivers.noneTransferTitle")}
                </p>
                <p className="mt-2 max-w-md text-sm text-white/50">
                  {transferDestination
                    ? `${transferDestinationLabel(transferDestination)} — ${t("drivers.noneTransferText")}`
                    : t("drivers.noneTransferText")}
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <a
                    href={whatsappUrl(
                      transferDestination
                        ? `Bonjour, je cherche un transfert vers ${transferDestinationLabel(transferDestination)}.`
                        : undefined
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary text-sm"
                  >
                    <MessageCircle className="h-4 w-4" />
                    {t("drivers.transferSupport")}
                  </a>
                  <button
                    onClick={() => setTransfer("")}
                    className="btn-ghost text-sm"
                  >
                    {t("drivers.transferReset")}
                  </button>
                </div>
              </>
            ) : drivers.length === 0 ? (
              // Annuaire entièrement vide : ce n'est pas un filtre trop
              // restrictif, il n'y a encore personne. Le dire franchement vaut
              // mieux que d'inviter à « élargir la recherche » pour rien.
              <>
                <p className="text-lg font-semibold text-white">
                  {t("drivers.emptyTitle")}
                </p>
                <p className="mt-2 max-w-md text-sm text-white/50">
                  {t("drivers.emptyText")}
                </p>
                <a
                  href={whatsappUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary mt-6 text-sm"
                >
                  {t("drivers.transferSupport")}
                </a>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold text-white">
                  {t("drivers.noneTitle")}
                </p>
                <p className="mt-2 text-sm text-white/50">
                  {t("drivers.noneText")}
                </p>
              </>
            )}
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
