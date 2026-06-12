"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import type { Driver } from "@/lib/types";
import { StarRating } from "./StarRating";

function ratingBreakdown(driver: Driver) {
  // Synthesise a believable distribution centred on the average.
  const r = driver.rating;
  const five = Math.round(((r - 4) / 1) * 100);
  return [
    { stars: 5, pct: Math.min(98, Math.max(60, five)) },
    { stars: 4, pct: Math.max(2, 100 - Math.min(98, Math.max(60, five)) - 4) },
    { stars: 3, pct: 3 },
    { stars: 2, pct: 1 },
    { stars: 1, pct: 1 },
  ];
}

export function Reviews({ driver }: { driver: Driver }) {
  const breakdown = ratingBreakdown(driver);

  return (
    <div>
      <div className="grid gap-8 rounded-3xl glass p-6 sm:grid-cols-[auto_1fr] sm:p-8">
        <div className="flex flex-col items-center justify-center text-center sm:pr-8">
          <p className="text-5xl font-semibold text-white">
            {driver.rating.toFixed(2)}
          </p>
          <StarRating value={driver.rating} size={16} className="mt-2" />
          <p className="mt-2 text-sm text-white/50">
            {driver.reviewsCount} avis vérifiés
          </p>
        </div>
        <div className="space-y-2 sm:border-l sm:border-white/10 sm:pl-8">
          {breakdown.map((b) => (
            <div key={b.stars} className="flex items-center gap-3">
              <span className="w-3 text-sm text-white/50">{b.stars}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${b.pct}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="h-full rounded-full bg-gradient-to-r from-royal-500 to-royal-400"
                />
              </div>
              <span className="w-9 text-right text-xs text-white/40">
                {b.pct}%
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {driver.reviews.map((rev, i) => (
          <motion.div
            key={rev.id}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.5, delay: (i % 2) * 0.08 }}
            className="rounded-2xl glass p-5"
          >
            <div className="flex items-center gap-3">
              <Image
                src={rev.avatar}
                alt={rev.author}
                width={40}
                height={40}
                className="h-10 w-10 rounded-full object-cover"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">{rev.author}</p>
                <p className="text-xs text-white/40">{rev.date}</p>
              </div>
              <StarRating value={rev.rating} size={12} />
            </div>
            <p className="mt-3 text-sm leading-relaxed text-white/65">
              “{rev.comment}”
            </p>
            {rev.trip && (
              <span className="mt-3 inline-flex chip">{rev.trip}</span>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
