"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ShieldCheck, Star, ArrowRight } from "lucide-react";
import { SearchBar } from "./SearchBar";

const stats = [
  { value: "1 200+", label: "Chauffeurs vérifiés" },
  { value: "4.96", label: "Note moyenne" },
  { value: "48k", label: "Trajets premium" },
  { value: "4", label: "Villes" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-16 sm:pt-40">
      {/* Ambient glows */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-royal-600/20 blur-[140px]" />
        <div className="absolute right-0 top-40 h-[400px] w-[400px] rounded-full bg-royal-400/10 blur-[120px]" />
        <div className="absolute inset-0 bg-grid-faint [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,#000_20%,transparent_70%)]" />
      </div>

      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-3xl text-center"
        >
          <span className="section-eyebrow mb-6">
            <Star className="h-3 w-3 fill-gold-400 text-gold-400" />
            Chauffeurs privés d'exception
          </span>

          <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
            <span className="text-gradient">Votre chauffeur privé,</span>
            <br />
            <span className="text-gradient-royal">à la hauteur de l'instant.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-white/60 sm:text-lg">
            LumeCar connecte les voyageurs les plus exigeants aux meilleurs
            chauffeurs privés vérifiés. Réservez l'excellence à Paris, Londres,
            Barcelone et New York.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/drivers" className="btn-primary group w-full sm:w-auto">
              Trouver un chauffeur
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/auth/register?role=driver"
              className="btn-ghost w-full sm:w-auto"
            >
              Devenir chauffeur
            </Link>
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-white/40">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Chauffeurs vérifiés · Paiement sécurisé · Assistance 24/7
          </div>
        </motion.div>

        {/* Search */}
        <div className="mx-auto mt-12 max-w-4xl">
          <SearchBar />
        </div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.6 }}
          className="mx-auto mt-12 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4"
        >
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-2xl font-semibold text-white sm:text-3xl">
                {s.value}
              </p>
              <p className="mt-1 text-xs text-white/40">{s.label}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
