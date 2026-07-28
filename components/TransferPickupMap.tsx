"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plane } from "lucide-react";
import { airports } from "@/lib/transfer";

const hubs = airports.filter((a) => !a.origin);

export function TransferPickupMap() {
  const [active, setActive] = useState(hubs[0].id);

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-ink-900 shadow-card">
      <div className="relative h-[380px] w-full sm:h-[460px]">
        <div className="absolute inset-0 bg-grid-faint [background-size:36px_36px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(47,99,255,0.16),transparent_55%)]" />

        {hubs.map((a) => {
          const isActive = a.id === active;
          return (
            <button
              key={a.id}
              onMouseEnter={() => setActive(a.id)}
              onFocus={() => setActive(a.id)}
              onClick={() => setActive(a.id)}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${a.mapX}%`, top: `${a.mapY}%` }}
              aria-label={a.name}
            >
              {/* Pickup-zone ring */}
              <motion.span
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-royal-400/40"
                animate={{
                  width: isActive ? 96 : 56,
                  height: isActive ? 96 : 56,
                  opacity: isActive ? 0.9 : 0.4,
                }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
              />
              {isActive && (
                <motion.span
                  initial={{ scale: 0.6, opacity: 0.6 }}
                  animate={{ scale: 1.6, opacity: 0 }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                  className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-royal-500/25"
                />
              )}
              <span
                className={`relative grid h-8 w-8 place-items-center rounded-full shadow-glow transition ${
                  isActive
                    ? "bg-gradient-to-br from-royal-400 to-royal-600 text-white"
                    : "bg-white/10 text-white/70"
                }`}
              >
                <Plane className="h-4 w-4" />
              </span>
            </button>
          );
        })}

        {/* Active airport label */}
        <div className="pointer-events-none absolute inset-x-4 bottom-4">
          {hubs
            .filter((a) => a.id === active)
            .map((a) => (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-2 rounded-2xl glass-strong px-4 py-2.5"
              >
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-royal-500/20 text-[11px] font-semibold text-royal-200">
                  {a.code}
                </span>
                <span className="text-sm font-medium text-white">{a.name}</span>
              </motion.div>
            ))}
        </div>
      </div>
    </div>
  );
}
