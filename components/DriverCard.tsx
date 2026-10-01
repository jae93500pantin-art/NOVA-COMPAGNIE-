"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Languages, BadgeCheck, Clock, Car, ShieldCheck } from "lucide-react";
import type { Driver } from "@/lib/types";
import { cn, formatPrice } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { hasVerifiedCnapsCard } from "@/lib/cnaps";

export function DriverCard({ driver, index = 0 }: { driver: Driver; index?: number }) {
  const { t } = useI18n();

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay: (index % 4) * 0.08, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={`/drivers/${driver.id}`}
        className={cn(
          "group relative block overflow-hidden rounded-3xl glass transition-all duration-500 hover:border-white/20 hover:shadow-glow",
          // Hors ligne : la carte s'efface sans disparaître. Le chauffeur
          // reste réservable pour un créneau à venir (c'est le planning qui
          // tranche), mais l'œil doit d'abord tomber sur ceux qui répondent
          // maintenant. Le survol rend la carte intacte.
          !driver.available &&
            "opacity-70 grayscale-[0.4] hover:opacity-100 hover:grayscale-0"
        )}
      >
        {/* Header — driver photo as focal point (no car background) */}
        <div className="relative overflow-hidden p-5">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-royal-500/10 via-transparent to-transparent" />

          <div className="relative flex items-center justify-between gap-2">
            <span
              className={cn(
                "chip",
                driver.available
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                  : "border-white/10 bg-black/30 text-white/60"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  driver.available ? "bg-emerald-400 animate-pulse" : "bg-white/40"
                )}
              />
              {driver.available ? t("drivers.available") : t("drivers.busy")}
            </span>
            <span className="flex items-center gap-1.5">
              {/* ⚠️ La mention de contrôle est PAR CHAUFFEUR, pas par site.
                  Depuis qu'un administrateur peut valider un dossier incomplet
                  par dérogation, « référencé » et « pièces contrôlées » ne sont
                  plus la même chose. `documentsVerified` est calculé à la
                  lecture depuis les pièces réellement cochées — et vaut faux
                  par défaut, y compris avant la migration : une mention
                  accordée par défaut ne vaut rien, et c'est elle qui engage la
                  plateforme. */}
              {driver.documentsVerified && (
                <span className="chip border-emerald-400/40 bg-emerald-400/10 text-emerald-200">
                  <ShieldCheck className="h-3 w-3 shrink-0" />
                  {t("drivers.docsVerified")}
                </span>
              )}
              {/* Qualification personnelle du chauffeur, à côté de la gamme
                  du véhicule. ⚠️ Elle ne désigne AUCUNE prestation de
                  sécurité : la plateforme n'en vend pas (voir lib/cnaps.ts).
                  Une carte en attente d'examen n'affiche rien. */}
              {hasVerifiedCnapsCard(driver) && (
                <span className="chip border-royal-400/40 bg-royal-500/15 text-royal-200">
                  <ShieldCheck className="h-3 w-3 shrink-0" />
                  {t("cnaps.badge")}
                </span>
              )}
              <span className="chip">{driver.categories[0]}</span>
            </span>
          </div>

          <div className="relative mt-5 flex items-center gap-4">
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-2 border-white/15 shadow-card">
              <Image
                src={driver.avatar}
                alt={`${driver.firstName} ${driver.lastName}`}
                fill
                sizes="96px"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
            <div className="min-w-0">
              <h3 className="flex items-center gap-1.5 text-base font-semibold text-white">
                {driver.firstName} {driver.lastName}
                {driver.badges.includes("Top Pro") && (
                  <BadgeCheck className="h-4 w-4 shrink-0 text-royal-400" />
                )}
              </h3>
              <p className="mt-1 flex items-center gap-1 text-xs text-white/60">
                <Car className="h-3 w-3 shrink-0 text-royal-300" />
                <span className="truncate">
                  {driver.car.make} {driver.car.model}
                </span>
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs text-white/50">
                <Languages className="h-3 w-3 shrink-0" />
                <span className="truncate">{driver.languages.join(", ")}</span>
              </p>
              {/* ⚠️ Plus de note ni d'étoiles. Un avis ne pouvait être certifié
                  que par la course qui l'a produite ; sans réservation, il n'y
                  a plus rien à certifier. `drivers.rating` vaut 5.0 par défaut
                  en base : l'afficher publierait « 5,0 ★ · 0 avis » sur chaque
                  fiche neuve, c'est-à-dire une note inventée. */}
              <p className="mt-2 flex items-center gap-1 text-[11px] text-white/40">
                <Clock className="h-3 w-3 shrink-0" />
                {driver.experienceYears} {t("drivers.yearsExp")}
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 pb-5">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/50">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {driver.responseTime}
            </span>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
            {/* Le tarif ANNONCÉ PAR LE CHAUFFEUR, seul et tel quel. Plus de
                total client ni de ligne de frais : la plateforme n'ajoute rien
                et n'encaisse rien, donc afficher un autre montant que le sien
                laisserait croire qu'elle vend la course. */}
            <p className="text-sm text-white/50">
              {t("drivers.fromPrice")}{" "}
              <span className="font-medium text-white">
                {formatPrice(driver.pricePerHour)}
              </span>
              <span className="text-white/40"> / h</span>
            </p>
            <span className="rounded-full bg-white/5 px-4 py-2 text-xs font-medium text-white transition group-hover:bg-royal-500 group-hover:text-white">
              {t("drivers.viewProfile")}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
