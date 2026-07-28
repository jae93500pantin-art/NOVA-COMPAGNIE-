"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Languages, BadgeCheck, Clock, Car } from "lucide-react";
import type { Driver } from "@/lib/types";
import { StarRating } from "./StarRating";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

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
        className="group relative block overflow-hidden rounded-3xl glass transition-all duration-500 hover:border-white/20 hover:shadow-glow"
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
            <span className="chip">{driver.categories[0]}</span>
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
              <div className="mt-2 flex items-center gap-2">
                <StarRating value={driver.rating} size={12} showValue />
                <span className="text-[11px] text-white/40">
                  {driver.reviewsCount} {t("drivers.reviews")}
                </span>
              </div>
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
            <div>
              <div>
                <span className="text-lg font-semibold text-white">
                  €{driver.pricePerHour}
                </span>
                <span className="text-xs text-white/40"> {t("drivers.perHour")}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-white/40">
                €{driver.pricePerDay} {t("drivers.perDay")} · {t("drivers.quoteWeek")}
              </p>
            </div>
            <span className="rounded-full bg-white/5 px-4 py-2 text-xs font-medium text-white transition group-hover:bg-royal-500 group-hover:text-white">
              {t("drivers.viewProfile")}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
