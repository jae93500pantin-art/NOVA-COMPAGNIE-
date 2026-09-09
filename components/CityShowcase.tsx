"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { cities } from "@/lib/cities";
import { driversByCity } from "@/lib/drivers";

/**
 * Le compte affiché est **dérivé de l'annuaire réel**, jamais saisi.
 * `city.driversCount` annonçait 248 chauffeurs à Paris alors qu'il n'y en avait
 * cinq, inventés : sur un site où l'on peut réserver, c'est une affirmation
 * commerciale fausse. Tant que personne n'est inscrit, la carte le dit.
 */
function driversLabel(cityId: string): string {
  const n = driversByCity(cityId).length;
  if (n === 0) return "Bientôt disponible";
  return `${n} chauffeur${n > 1 ? "s" : ""}`;
}

export function CityShowcase() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cities.map((c, i) => (
        <motion.div
          key={c.id}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
          className={c.primary ? "sm:col-span-2 lg:col-span-2 lg:row-span-1" : ""}
        >
          <Link
            href={`/drivers?city=${c.id}`}
            className="group relative block h-64 overflow-hidden rounded-3xl border border-white/10"
          >
            <Image
              src={c.image}
              alt={c.name}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover transition-transform duration-[1200ms] group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/30 to-transparent" />
            <div className="absolute inset-0 ring-1 ring-inset ring-white/5" />

            {c.primary && (
              <span className="absolute right-4 top-4 chip border-royal-400/30 bg-royal-500/20 text-royal-200 backdrop-blur-md">
                Ville phare
              </span>
            )}

            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-5">
              <div>
                <h3 className="text-xl font-semibold text-white">{c.name}</h3>
                <p className="mt-0.5 text-sm text-white/50">
                  {c.country} · {driversLabel(c.id)}
                </p>
              </div>
              <span className="grid h-10 w-10 place-items-center rounded-full glass transition group-hover:bg-royal-500">
                <ArrowUpRight className="h-4 w-4 text-white" />
              </span>
            </div>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
