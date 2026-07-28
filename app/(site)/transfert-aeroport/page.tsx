"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Clock,
  BadgeCheck,
  Lock,
  Zap,
  RefreshCw,
  CalendarCheck,
  PlaneLanding,
  Radar,
  UserCheck,
  Luggage,
  MailCheck,
  ArrowRight,
} from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { Reveal } from "@/components/Reveal";
import { TransferEstimate } from "@/components/TransferEstimate";
import { TransferPickupMap } from "@/components/TransferPickupMap";
import { useI18n } from "@/lib/i18n";

export default function TransferPage() {
  const { t } = useI18n();

  const badges = [
    { icon: Clock, label: t("transfer.badge247") },
    { icon: BadgeCheck, label: t("transfer.badgePro") },
    { icon: Lock, label: t("transfer.badgeSecure") },
    { icon: Zap, label: t("transfer.badgeInstant") },
    { icon: RefreshCw, label: t("transfer.badgeFlexible") },
  ];

  const features = [
    { icon: CalendarCheck, title: t("transfer.feat1Title"), text: t("transfer.feat1Text") },
    { icon: PlaneLanding, title: t("transfer.feat2Title"), text: t("transfer.feat2Text") },
    { icon: Radar, title: t("transfer.feat3Title"), text: t("transfer.feat3Text") },
    { icon: UserCheck, title: t("transfer.feat4Title"), text: t("transfer.feat4Text") },
    { icon: Luggage, title: t("transfer.feat5Title"), text: t("transfer.feat5Text") },
    { icon: MailCheck, title: t("transfer.feat6Title"), text: t("transfer.feat6Text") },
  ];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden pt-32 pb-16">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-royal-500/20 blur-[120px]" />
          <div className="absolute inset-0 bg-grid-faint [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_top,#000_10%,transparent_70%)]" />
        </div>

        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 lg:grid-cols-2 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="section-eyebrow mb-5">{t("transfer.eyebrow")}</span>
            <h1 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight text-white sm:text-4xl lg:text-5xl">
              {t("transfer.title")}
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-white/60">
              {t("transfer.subtitle")}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/drivers" className="btn-primary">
                {t("transfer.bookCta")}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#estimate" className="btn-ghost">
                {t("transfer.estimateCta")}
              </a>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] border border-white/10 shadow-card">
              <Image
                src="https://images.unsplash.com/photo-1600320254374-ce2d293c324e?auto=format&fit=crop&w=1200&q=80"
                alt={t("transfer.heroImageAlt")}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink-950/70 via-transparent to-transparent" />
            </div>
          </motion.div>
        </div>

        {/* Trust badges */}
        <Reveal>
          <div className="mx-auto mt-14 flex max-w-5xl flex-wrap items-center justify-center gap-3 px-5 lg:px-8">
            {badges.map((b) => (
              <span key={b.label} className="chip gap-2 px-4 py-2 text-white/80">
                <b.icon className="h-3.5 w-3.5 text-royal-300" />
                {b.label}
              </span>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <SectionHeader
          eyebrow={t("transfer.featuresEyebrow")}
          title={t("transfer.featuresTitle")}
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 0.08}>
              <div className="flex h-full items-start gap-4 rounded-2xl glass p-6 transition hover:border-white/20">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/5 text-royal-300">
                  <f.icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-semibold text-white">{f.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-white/50">{f.text}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Estimate */}
      <section id="estimate" className="mx-auto max-w-5xl px-5 py-16 lg:px-8">
        <SectionHeader
          eyebrow={t("transfer.estimateEyebrow")}
          title={t("transfer.estimateTitle")}
          subtitle={t("transfer.estimateSubtitle")}
        />
        <Reveal>
          <div className="mt-12">
            <TransferEstimate />
          </div>
        </Reveal>
      </section>

      {/* Pickup map */}
      <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <SectionHeader
              eyebrow={t("transfer.mapEyebrow")}
              title={t("transfer.mapTitle")}
              subtitle={t("transfer.mapSubtitle")}
              align="left"
            />
          </div>
          <Reveal>
            <TransferPickupMap />
          </Reveal>
        </div>
      </section>
    </>
  );
}
