"use client";

import Image from "next/image";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Gallery({ photos, alt }: { photos: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  const go = (dir: number) =>
    setActive((a) => (a + dir + photos.length) % photos.length);

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
              src={photos[active]}
              alt={alt}
              fill
              sizes="(max-width: 1024px) 100vw, 60vw"
              className="object-cover"
              priority
            />
          </motion.div>
        </AnimatePresence>
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/40 to-transparent" />

        {photos.length > 1 && (
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

      {photos.length > 1 && (
        <div className="mt-3 flex gap-3">
          {photos.map((p, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`relative h-16 w-24 overflow-hidden rounded-xl border transition ${
                active === i
                  ? "border-royal-400 ring-2 ring-royal-500/30"
                  : "border-white/10 opacity-60 hover:opacity-100"
              }`}
            >
              <Image src={p} alt={`${alt} ${i + 1}`} fill sizes="96px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
