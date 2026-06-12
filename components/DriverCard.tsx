"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { MapPin, Languages, BadgeCheck, Clock } from "lucide-react";
import type { Driver } from "@/lib/types";
import { getCity } from "@/lib/cities";
import { StarRating } from "./StarRating";
import { cn } from "@/lib/utils";

export function DriverCard({ driver, index = 0 }: { driver: Driver; index?: number }) {
  const city = getCity(driver.cityId);

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
        <div className="relative h-52 overflow-hidden">
          <Image
            src={driver.car.photos[0]}
            alt={`${driver.car.make} ${driver.car.model}`}
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/30 to-transparent" />

          <div className="absolute left-4 top-4 flex gap-2">
            <span
              className={cn(
                "chip backdrop-blur-md",
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
              {driver.available ? "Disponible" : "Occupé"}
            </span>
          </div>

          <div className="absolute right-4 top-4 chip backdrop-blur-md">
            {driver.categories[0]}
          </div>

          <div className="absolute -bottom-7 left-5">
            <div className="relative h-16 w-16 overflow-hidden rounded-2xl border-2 border-white/20 shadow-card">
              <Image
                src={driver.avatar}
                alt={driver.firstName}
                fill
                sizes="64px"
                className="object-cover"
              />
            </div>
          </div>
        </div>

        <div className="px-5 pb-5 pt-9">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-1.5 text-base font-semibold text-white">
                {driver.firstName} {driver.lastName}
                {driver.badges.includes("Top Pro") && (
                  <BadgeCheck className="h-4 w-4 text-royal-400" />
                )}
              </h3>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-white/50">
                <MapPin className="h-3 w-3" />
                {city?.name} · {driver.experienceYears} ans d'expérience
              </p>
            </div>
            <div className="text-right">
              <StarRating value={driver.rating} size={12} showValue />
              <p className="mt-0.5 text-[11px] text-white/40">
                {driver.reviewsCount} avis
              </p>
            </div>
          </div>

          <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-white/50">
            {driver.bio}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-white/50">
            <span className="inline-flex items-center gap-1">
              <Languages className="h-3 w-3" />
              {driver.languages.slice(0, 2).join(", ")}
            </span>
            <span className="h-1 w-1 rounded-full bg-white/20" />
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {driver.responseTime}
            </span>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
            <div>
              <span className="text-lg font-semibold text-white">
                €{driver.pricePerHour}
              </span>
              <span className="text-xs text-white/40"> / heure</span>
            </div>
            <span className="rounded-full bg-white/5 px-4 py-2 text-xs font-medium text-white transition group-hover:bg-royal-500 group-hover:text-white">
              Voir le profil →
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
