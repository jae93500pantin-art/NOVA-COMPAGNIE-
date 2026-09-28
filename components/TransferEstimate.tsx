"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plane,
  MapPin,
  Car,
  ArrowRight,
  AlertCircle,
  MessageCircle,
  Users,
  ChevronRight,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { formatPrice, initials } from "@/lib/utils";
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
  getAirport,
  getVehicle,
  driversForTransferDestination,
  driversForTransferVehicle,
  getTransferDestination,
  transferDestinationLabel,
  zoneDestinationId,
} from "@/lib/transfer";

/**
 * Recherche « qui dessert ce trajet ? » de la page Transfert Aéroport.
 *
 * ## ⚠️ Une recherche, pas une estimation
 *
 * Statut d'annuaire. Ce bloc s'appelait « Estimation instantanée » et
 * annonçait un montant : c'était un **forfait décidé par Nova** (Berline 100 € /
 * Van 150 € / Première 200 €) pour une prestation qu'elle ne vend pas. Il rend
 * maintenant la seule réponse qu'un annuaire peut donner : **la liste des
 * chauffeurs qui desservent ce trajet, avec les tarifs qu'ils ont eux-mêmes
 * annoncés.**
 *
 * ⚠️ **Le « à partir de » ne se calcule que sur des prix réellement annoncés** :
 * c'est le minimum des tarifs des chauffeurs listés, jamais une moyenne, jamais
 * une valeur de départ que la plateforme aurait choisie. Aucun chauffeur qui
 * corresponde ⇒ **aucun montant affiché**, parce qu'il n'y en a aucun à citer.
 *
 * ⚠️ **Le tarif cité est HORAIRE.** Les chauffeurs déclarent un tarif à l'heure
 * et à la journée ; aucun ne déclare de forfait transfert (il n'y a pas de
 * colonne pour ça). Écrire « forfait » sur un tarif horaire serait un prix
 * inventé — d'où le suffixe « / h » partout, et la note qui dit que le montant
 * exact se convient avec le chauffeur.
 */
export function TransferEstimate({ drivers = [] }: { drivers?: Driver[] }) {
  const { t } = useI18n();
  const [airport, setAirport] = useState<string>(airports[0].id);
  const [zone, setZone] = useState<string>(zones[0].id);
  const [vehicle, setVehicle] = useState<string>(vehicles[0].id);

  /**
   * L'annuaire arrive de la page serveur (`listDirectory`), puis on ré-applique
   * les réglages que le chauffeur a enregistrés dans son navigateur : cocher
   * une destination dans son profil change cette liste sans rechargement.
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

  const destinationId = zoneDestinationId(zone);
  const destination = getTransferDestination(destinationId);
  const servingDestination = useMemo(
    () => driversForTransferDestination(pool, destinationId),
    [pool, destinationId]
  );
  /**
   * Choisir une classe restreint la recherche à cette classe seule, via la même
   * fonction de classement que la fiche : la classe affichée et les chauffeurs
   * listés ne peuvent pas se contredire.
   */
  const matching = useMemo(
    () => driversForTransferVehicle(servingDestination, vehicle),
    [servingDestination, vehicle]
  );

  /**
   * « À partir de » = le plus bas des tarifs ANNONCÉS par les chauffeurs
   * listés. ⚠️ Un tarif à 0 (« non communiqué ») est exclu du calcul : le faire
   * entrer donnerait un « à partir de 0 € » qui n'est le prix de personne.
   * Aucun tarif exploitable ⇒ `null`, et rien ne s'affiche.
   */
  const fromPrice = useMemo(() => {
    const rates = matching.map((d) => d.pricePerHour).filter((p) => p > 0);
    return rates.length > 0 ? Math.min(...rates) : null;
  }, [matching]);

  /** Distingués pour que le refus nomme sa cause — les deux se corrigent autrement. */
  const blockedBy: "destination" | "vehicle" | null =
    servingDestination.length === 0
      ? "destination"
      : matching.length === 0
      ? "vehicle"
      : null;

  const cityId = getAirport(airport)?.cityId ?? "paris";
  const listingHref = `/drivers?city=${cityId}&transfer=${encodeURIComponent(
    destinationId
  )}&vehicle=${encodeURIComponent(vehicle)}`;

  return (
    <div className="grid gap-6 rounded-3xl glass-strong p-6 shadow-card lg:grid-cols-[1fr_1fr] lg:p-8">
      {/* Critères */}
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

        {/* Une carte par classe, avec le nombre de chauffeurs qui desservent
            réellement le trajet ci-dessus. */}
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/40">
            <Car className="h-3.5 w-3.5 text-royal-400" /> {t("transfer.estVehicle")}
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {vehicles.map((v) => {
              const count = driversForTransferVehicle(
                servingDestination,
                v.id
              ).length;
              const on = vehicle === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setVehicle(v.id)}
                  className={`rounded-2xl border p-3 text-left transition ${
                    on
                      ? "border-royal-400/50 bg-royal-500/15"
                      : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                  } ${count === 0 ? "opacity-60" : ""}`}
                >
                  <span className="block text-sm font-medium text-white">
                    {t(`transfer.${v.labelKey}`)}
                  </span>
                  <span
                    className={`mt-1 flex items-center gap-1 text-[11px] ${
                      count > 0 ? "text-white/40" : "text-white/30"
                    }`}
                  >
                    <Users
                      className={`h-3 w-3 ${
                        count > 0 ? "text-emerald-400" : "text-white/30"
                      }`}
                    />
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Résultat : des chauffeurs, pas un montant */}
      <div className="flex flex-col rounded-2xl bg-gradient-to-br from-ink-800 to-ink-900 p-6">
        <AnimatePresence mode="wait">
          {blockedBy ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              {/* État vide utile : il nomme la cause, dit quoi faire, et laisse
                  une porte de sortie. Un « 0 chauffeur » sec laissait le
                  visiteur devant un compteur sans action. */}
              <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-200">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {blockedBy === "vehicle"
                  ? t("transfer.estNoneVehicleTitle")
                  : t("transfer.estNoneTitle")}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-white/55">
                {blockedBy === "vehicle"
                  ? t("transfer.estNoneVehicleText")
                  : t("transfer.estNoneText")}
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-white/45">
                <li className="flex gap-2">
                  <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-royal-300" />
                  {t("transfer.estEmptyTry1")}
                </li>
                <li className="flex gap-2">
                  <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-royal-300" />
                  {t("transfer.estEmptyTry2")}
                </li>
              </ul>
              <a
                href={whatsappUrl(
                  destination
                    ? `Bonjour, je cherche un chauffeur pour ${transferDestinationLabel(
                        destination
                      )}.`
                    : undefined
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary mt-4 w-full text-sm"
              >
                <MessageCircle className="h-4 w-4" />
                {t("transfer.estSupport")}
              </a>
              <Link href="/drivers" className="btn-ghost mt-2 w-full text-sm">
                {t("transfer.estEmptyAll")}
              </Link>
            </motion.div>
          ) : (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="flex h-full flex-col"
            >
              <p className="text-[11px] uppercase tracking-wider text-white/40">
                {t("transfer.estResult")}
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-white">
                {matching.length}{" "}
                <span className="text-base font-normal text-white/60">
                  {matching.length > 1
                    ? t("transfer.estAvailableMany")
                    : t("transfer.estAvailableOne")}
                </span>
              </p>

              {/* ⚠️ Affiché seulement s'il existe un tarif annoncé à citer. */}
              {fromPrice !== null && (
                <p className="mt-2 text-sm text-white/60">
                  {t("drivers.fromPrice")}{" "}
                  <span className="font-semibold text-white">
                    {formatPrice(fromPrice)}
                  </span>
                  <span className="text-white/40"> / h</span>
                </p>
              )}

              {destination && (
                <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-white/70">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-royal-400" />
                  {transferDestinationLabel(destination)}
                </p>
              )}

              {/* La liste elle-même : chaque chauffeur avec SON tarif. */}
              <ul className="mt-4 space-y-2">
                {matching.slice(0, 4).map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/drivers/${d.id}`}
                      className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition hover:border-white/25 hover:bg-white/[0.06]"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 text-xs font-semibold text-white">
                        {initials(d.firstName, d.lastName)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-white">
                          {d.firstName} {d.lastName}
                        </span>
                        <span className="block truncate text-[11px] text-white/45">
                          {d.car.make} {d.car.model}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        {d.pricePerHour > 0 ? (
                          <span className="block text-sm font-semibold text-white">
                            {formatPrice(d.pricePerHour)}
                            <span className="text-[11px] font-normal text-white/40">
                              {" "}
                              / h
                            </span>
                          </span>
                        ) : (
                          <span className="block text-[11px] text-white/40">
                            {t("transfer.estNoRate")}
                          </span>
                        )}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-white/30 transition group-hover:translate-x-0.5 group-hover:text-white/60" />
                    </Link>
                  </li>
                ))}
              </ul>

              <p className="mt-3 text-[11px] leading-relaxed text-white/40">
                {t("transfer.estNote")}
              </p>

              <Link href={listingHref} className="btn-primary mt-4 w-full text-sm">
                {t("transfer.estCta")}
                <ArrowRight className="h-4 w-4" />
              </Link>
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
