"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  getDriverOverrides,
  DRIVER_OVERRIDES_EVENT,
} from "@/lib/driverOverrides";

export function Gallery({
  photos,
  alt,
  driverId,
}: {
  photos: string[];
  alt: string;
  /** When set, live-merges the driver's locally-uploaded car photos. */
  driverId?: string;
}) {
  const [list, setList] = useState<string[]>(photos);
  const [active, setActive] = useState(0);

  // Reflect the driver's own uploaded photos (demo overrides in localStorage).
  useEffect(() => {
    if (!driverId) return;
    const sync = () => {
      const o = getDriverOverrides(driverId);
      setList(o.carPhotos && o.carPhotos.length > 0 ? o.carPhotos : photos);
      setActive(0);
    };
    sync();
    window.addEventListener(DRIVER_OVERRIDES_EVENT, sync);
    return () => window.removeEventListener(DRIVER_OVERRIDES_EVENT, sync);
  }, [driverId, photos]);

  const go = (dir: number) =>
    setActive((a) => (a + dir + list.length) % list.length);

  if (list.length === 0) return null;

  return (
    <div>
      <div className="relative h-72 overflow-hidden rounded-3xl border border-white/10 sm:h-96">
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0"
          >
            <Image
              src={list[active]}
              alt={alt}
              fill
              sizes="(max-width: 1024px) 100vw, 60vw"
              className="object-cover"
              priority
              unoptimized={list[active]?.startsWith("data:")}
            />
          </motion.div>
        </AnimatePresence>
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/40 to-transparent" />

        {list.length > 1 && (
          <>
            <button
              onClick={() => go(-1)}
              className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full glass-strong text-white transition hover:bg-white/20"
              aria-label="Précédent"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => go(1)}
              className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full glass-strong text-white transition hover:bg-white/20"
              aria-label="Suivant"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {list.length > 1 && (
        <div className="mt-3 flex gap-3">
          {list.map((p, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`relative h-16 w-24 overflow-hidden rounded-xl border transition ${
                active === i
                  ? "border-royal-400 ring-2 ring-royal-500/30"
                  : "border-white/10 opacity-60 hover:opacity-100"
              }`}
            >
              <Image
                src={p}
                alt={`${alt} ${i + 1}`}
                fill
                sizes="96px"
                className="object-cover"
                unoptimized={p?.startsWith("data:")}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
