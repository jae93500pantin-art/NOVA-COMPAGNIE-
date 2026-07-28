"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Search,
  MessagesSquare,
  CarFront,
  ShieldCheck,
  BadgeCheck,
  Lock,
  Plane,
  ArrowRight,
  Clock,
  Zap,
} from "lucide-react";
import { Hero } from "@/components/Hero";
import { SectionHeader } from "@/components/SectionHeader";
import { Reveal } from "@/components/Reveal";
import { useI18n } from "@/lib/i18n";

export default function Home() {
  const { t } = useI18n();

  const steps = [
    { icon: Search, title: t("home.step1Title"), text: t("home.step1Text") },
    { icon: MessagesSquare, title: t("home.step2Title"), text: t("home.step2Text") },
    { icon: CarFront, title: t("home.step3Title"), text: t("home.step3Text") },
  ];

  const features = [
    { icon: BadgeCheck, title: t("home.feat1Title"), text: t("home.feat1Text") },
    { icon: ShieldCheck, title: t("home.feat2Title"), text: t("home.feat2Text") },
    { icon: Lock, title: t("home.feat5Title"), text: t("home.feat5Text") },
    { icon: MessagesSquare, title: t("home.feat6Title"), text: t("home.feat6Text") },
  ];

  return (
    <>
      <Hero />

      {/* Airport transfer teaser */}
      <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <Reveal>
          <div className="relative grid items-center gap-8 overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-ink-800 to-ink-900 p-6 sm:p-10 lg:grid-cols-2 lg:gap-12">
            <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-royal-500/20 blur-[110px]" />
            <div className="relative">
              <span className="section-eyebrow mb-4">
                <Plane className="h-3.5 w-3.5" />
                {t("transfer.teaserEyebrow")}
              </span>
              <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl lg:text-4xl">
                {t("transfer.teaserTitle")}
              </h2>
              <p className="mt-4 max-w-md text-white/60">
                {t("transfer.teaserText")}
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <span className="chip gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-royal-300" />
                  {t("transfer.badge247")}
                </span>
                <span className="chip gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-royal-300" />
                  {t("transfer.badgeInstant")}
                </span>
              </div>
              <Link href="/transfert-aeroport" className="btn-primary mt-8">
                {t("transfer.teaserCta")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] border border-white/10">
              <Image
                src="https://images.unsplash.com/photo-1600320254374-ce2d293c324e?auto=format&fit=crop&w=1200&q=80"
                alt={t("transfer.heroImageAlt")}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink-950/60 via-transparent to-transparent" />
            </div>
          </div>
        </Reveal>
      </section>

      {/* How it works */}
      <section id="concept" className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <SectionHeader
          eyebrow={t("home.howEyebrow")}
          title={t("home.howTitle")}
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.1}>
              <div className="group relative h-full overflow-hidden rounded-3xl glass p-7 transition hover:border-white/20">
                <span className="absolute right-6 top-6 text-6xl font-semibold text-white/[0.04]">
                  0{i + 1}
                </span>
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-royal-400 to-royal-600 shadow-glow">
                  <s.icon className="h-5 w-5 text-white" />
                </span>
                <h3 className="mt-5 text-lg font-semibold text-white">
                  {s.title}
                </h3>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Features grid */}
      <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <SectionHeader
          eyebrow={t("home.whyEyebrow")}
          title={t("home.whyTitle")}
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
                  <p className="mt-1 text-sm leading-relaxed text-white/50">
                    {f.text}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-ink-800 to-ink-900 p-10 text-center sm:p-16">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-1/2 top-0 h-72 w-[600px] -translate-x-1/2 rounded-full bg-royal-500/25 blur-[120px]" />
              <div className="absolute inset-0 bg-grid-faint [background-size:40px_40px] opacity-40" />
            </div>
            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {t("home.ctaTitle")}
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-white/60">
                {t("home.ctaSubtitle")}
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href="/auth/register" className="btn-white">
                  {t("home.ctaClient")}
                </Link>
                <Link
                  href="/auth/register?role=driver"
                  className="btn-ghost"
                >
                  {t("home.ctaDriver")}
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
