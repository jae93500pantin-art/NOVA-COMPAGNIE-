"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Plane } from "lucide-react";
import { SearchBar } from "./SearchBar";
import { Globe } from "./Globe";
import { useI18n } from "@/lib/i18n";

export function Hero() {
  const { t } = useI18n();

  return (
    <section className="relative overflow-hidden pt-28 pb-16 sm:pt-32">
      {/* Animated globe backdrop (Google-Earth style blue marble), offset right */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-[6%] aspect-square w-[min(80vw,520px)] -translate-x-1/2 opacity-70 [mask-image:radial-gradient(circle_at_center,#000_68%,transparent_85%)] lg:left-auto lg:right-[14%] lg:top-1/2 lg:w-[min(40vw,520px)] lg:-translate-y-1/2 lg:translate-x-0 lg:opacity-95">
          <Globe />
        </div>
        <div className="absolute inset-0 bg-grid-faint [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,#000_10%,transparent_70%)]" />
        {/* Soft scrim so text/booking card stay fully legible, globe stays clear on the right */}
        <div className="absolute inset-y-0 left-0 w-2/3 bg-gradient-to-r from-ink-950 via-ink-950/75 to-transparent lg:w-3/5 lg:via-ink-950/40" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-ink-950 to-transparent" />
      </div>

      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:px-8">
        {/* Left — Uber-style headline + booking card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-xl"
        >
          <h1 className="mb-8 text-balance text-3xl font-semibold leading-[1.1] tracking-tight text-white sm:text-4xl lg:text-5xl">
            {t("hero.tagline")}
          </h1>

          {/* Booking card */}
          <div>
            <SearchBar />
          </div>

          <Link
            href="/transfert-aeroport"
            className="btn-ghost mt-3 w-full text-sm sm:w-auto"
          >
            <Plane className="h-4 w-4 text-royal-300" />
            {t("transfer.bookCta")}
          </Link>

          <p className="mt-4 text-xs text-white/40">
            {t("hero.memberPrompt")}{" "}
            <Link href="/auth/login" className="text-white/70 underline-offset-4 hover:underline">
              {t("hero.memberLogin")}
            </Link>{" "}
            {t("hero.memberSuffix")}
          </p>
        </motion.div>

        {/* Right — globe focal point (spacer on large screens; globe sits behind) */}
        <div className="relative hidden min-h-[420px] lg:block" aria-hidden />
      </div>
    </section>
  );
}
