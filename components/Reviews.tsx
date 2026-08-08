"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BadgeCheck, MapPin } from "lucide-react";
import type { Driver } from "@/lib/types";
import {
  formatReviewAge,
  ratingSummary,
  type CertifiedReview,
} from "@/lib/reviews";
import { useI18n } from "@/lib/i18n";
import { initials } from "@/lib/utils";
import { StarRating } from "./StarRating";

/** One row of the profile list, whether it comes from history or a real ride. */
interface DisplayReview {
  id: string;
  author: string;
  avatar?: string;
  rating: number;
  /** Ready-to-show age ("Il y a 3 jours"). */
  age: string;
  comment: string;
  trip?: string;
  certified: boolean;
}

export function Reviews({ driver }: { driver: Driver }) {
  const { lang } = useI18n();
  const [certified, setCertified] = useState<CertifiedReview[]>([]);

  // Published reviews live server-side; the page itself is statically
  // generated, so they are fetched after mount.
  useEffect(() => {
    let alive = true;
    fetch(`/api/reviews/${driver.id}`)
      .then((r) => (r.ok ? r.json() : { reviews: [] }))
      .then((d) => {
        if (alive) setCertified(d.reviews ?? []);
      })
      .catch(() => {
        /* the profile still shows its history */
      });
    return () => {
      alive = false;
    };
  }, [driver.id]);

  const now = Date.now();
  const list: DisplayReview[] = [
    ...certified.map((r) => ({
      id: r.id,
      author: r.author,
      rating: r.rating,
      age: formatReviewAge(r.createdAt, now, lang),
      comment: r.comment,
      trip: r.trip || undefined,
      certified: true,
    })),
    ...driver.reviews.map((r) => ({
      id: r.id,
      author: r.author,
      avatar: r.avatar,
      rating: r.rating,
      age: r.date,
      comment: r.comment,
      trip: r.trip,
      certified: false,
    })),
  ];

  /**
   * The driver's record carries the reputation built before this list; new
   * reviews are folded into it by weight so one rating cannot swing it.
   * Reviews already shown are excluded from the baseline to avoid counting
   * them twice.
   */
  const summary = ratingSummary(list, {
    average: driver.rating,
    count: Math.max(0, driver.reviewsCount - driver.reviews.length),
  });

  return (
    <div>
      <div className="grid gap-8 rounded-3xl glass p-6 sm:grid-cols-[auto_1fr] sm:p-8">
        <div className="flex flex-col items-center justify-center text-center sm:pr-8">
          <p className="text-5xl font-semibold text-white">
            {summary.average.toFixed(2)}
          </p>
          <StarRating value={summary.average} size={16} className="mt-2" />
          <p className="mt-2 text-sm text-white/50">{summary.count} avis</p>
          {certified.length > 0 && (
            <p className="mt-1 flex items-center gap-1 text-xs text-emerald-300">
              <BadgeCheck className="h-3.5 w-3.5" />
              {certified.length} avis certifié{certified.length > 1 ? "s" : ""}
            </p>
          )}
        </div>
        <div className="space-y-2 sm:border-l sm:border-white/10 sm:pl-8">
          <p className="mb-3 text-[11px] uppercase tracking-wider text-white/35">
            Répartition des avis publiés
          </p>
          {summary.distribution.map((b) => (
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
        {list.map((rev, i) => (
          <motion.div
            key={rev.id}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.5, delay: (i % 2) * 0.08 }}
            className="rounded-2xl glass p-5"
          >
            <div className="flex items-center gap-3">
              {rev.avatar ? (
                <Image
                  src={rev.avatar}
                  alt={rev.author}
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-royal-500/20 text-xs font-semibold text-royal-100">
                  {initials(
                    rev.author.split(" ")[0] ?? "",
                    rev.author.split(" ")[1] ?? ""
                  )}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
                  {rev.author}
                  {rev.certified && (
                    <BadgeCheck
                      className="h-3.5 w-3.5 shrink-0 text-emerald-400"
                      aria-label="Avis certifié"
                    />
                  )}
                </p>
                <p className="text-xs text-white/40">{rev.age}</p>
              </div>
              <StarRating value={rev.rating} size={12} />
            </div>
            <p className="mt-3 text-sm leading-relaxed text-white/65">
              “{rev.comment}”
            </p>
            {rev.trip && (
              <span className="chip mt-3 inline-flex items-center gap-1">
                <MapPin className="h-3 w-3 text-royal-400" />
                {rev.trip}
              </span>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
