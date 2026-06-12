"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Navigation, Car } from "lucide-react";
import type { Driver } from "@/lib/types";
import { cities } from "@/lib/cities";
import { StarRating } from "./StarRating";

export function InteractiveMap({ drivers }: { drivers: Driver[] }) {
  const [active, setActive] = useState<Driver | null>(drivers[0] ?? null);

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-ink-900 shadow-card">
      {/* Map base */}
      <div className="relative h-[420px] w-full sm:h-[520px]">
        <div className="absolute inset-0 bg-grid-faint [background-size:36px_36px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(47,99,255,0.18),transparent_55%)]" />

        {/* Abstract route lines */}
        <svg className="absolute inset-0 h-full w-full opacity-40" preserveAspectRatio="none">
          <defs>
            <linearGradient id="route" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#2f63ff" stopOpacity="0" />
              <stop offset="50%" stopColor="#598dff" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#2f63ff" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[
            "M 60,420 C 180,300 320,360 460,180",
            "M 0,260 C 200,220 360,320 620,120",
            "M 120,520 C 280,420 420,460 700,260",
          ].map((d, i) => (
            <motion.path
              key={i}
              d={d}
              fill="none"
              stroke="url(#route)"
              strokeWidth="1.5"
              strokeDasharray="6 8"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 2, delay: i * 0.3, ease: "easeInOut" }}
            />
          ))}
        </svg>

        {/* City labels */}
        {cities.map((c) => (
          <div
            key={c.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 text-[10px] font-medium uppercase tracking-widest text-white/30"
            style={{ left: `${c.mapX}%`, top: `${c.mapY - 8}%` }}
          >
            {c.name}
          </div>
        ))}

        {/* Driver pins */}
        {drivers.map((d) => {
          const isActive = active?.id === d.id;
          return (
            <button
              key={d.id}
              onClick={() => setActive(d)}
              className="group absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${d.mapX}%`, top: `${d.mapY}%` }}
              aria-label={`${d.firstName} ${d.lastName}`}
            >
              {d.available && (
                <span className="absolute inset-0 -z-10 animate-pulse-ring rounded-full bg-royal-500/40" />
              )}
              <span
                className={`grid h-10 w-10 place-items-center rounded-full border-2 transition-all duration-300 ${
                  isActive
                    ? "scale-125 border-white bg-royal-500 shadow-glow"
                    : "border-white/40 bg-ink-800/80 backdrop-blur group-hover:border-white"
                }`}
              >
                <Car className="h-4 w-4 text-white" />
              </span>
            </button>
          );
        })}

        {/* HUD top-left */}
        <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full glass px-3 py-1.5 text-xs text-white/70">
          <Navigation className="h-3.5 w-3.5 text-royal-400" />
          Temps réel · {drivers.filter((d) => d.available).length} chauffeurs en
          ligne
        </div>

        {/* Active driver card */}
        <AnimatePresence mode="wait">
          {active && (
            <motion.div
              key={active.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-x-4 bottom-4 sm:left-4 sm:right-auto sm:w-80"
            >
              <Link
                href={`/drivers/${active.id}`}
                className="flex items-center gap-3 rounded-2xl glass-strong p-3 shadow-card transition hover:border-white/20"
              >
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl">
                  <Image
                    src={active.avatar}
                    alt={active.firstName}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="truncate text-sm font-semibold text-white">
                      {active.firstName} {active.lastName}
                    </h4>
                    <span className="shrink-0 text-sm font-semibold text-white">
                      €{active.pricePerHour}
                    </span>
                  </div>
                  <p className="truncate text-xs text-white/50">
                    {active.car.make} {active.car.model}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <StarRating value={active.rating} size={11} showValue />
                    <span className="text-[11px] text-white/40">
                      · {active.responseTime}
                    </span>
                  </div>
                </div>
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
