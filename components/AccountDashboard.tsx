"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Calendar,
  MessageSquare,
  Heart,
  Star,
  TrendingUp,
  Car,
  Clock,
  MapPin,
  ArrowRight,
  Wallet,
  Power,
  ExternalLink,
  Sparkles,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { drivers, getDriver } from "@/lib/drivers";
import { conversations } from "@/lib/conversations";
import { getCity } from "@/lib/cities";
import { StarRating } from "./StarRating";
import { DriverRequests } from "./DriverRequests";
import { initials } from "@/lib/utils";

export function AccountDashboard() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/auth/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-royal-400 to-royal-600 text-xl font-semibold text-white shadow-glow">
            {initials(user.firstName, user.lastName)}
          </span>
          <div>
            <p className="text-sm text-white/50">
              {greeting()}, {user.firstName} 👋
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              {user.role === "driver" ? "Espace chauffeur" : "Mon espace"}
            </h1>
          </div>
        </div>
        <span className="chip w-fit border-royal-400/20 bg-royal-500/10 text-royal-200">
          <Sparkles className="h-3 w-3" />
          {user.role === "driver" ? "Compte chauffeur" : "Compte client"}
        </span>
      </motion.div>

      <div className="mt-5">
        <Link href="/compte/profil" className="btn-ghost text-sm">
          Éditer mon profil
        </Link>
      </div>

      <div className="mt-8">
        {user.role === "driver" ? (
          <DriverDashboard driverId={user.driverId} />
        ) : (
          <ClientDashboard firstName={user.firstName} />
        )}
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "Bonne nuit";
  if (h < 18) return "Bonjour";
  return "Bonsoir";
}

/* ───────────────────────── CLIENT ───────────────────────── */

function ClientDashboard({ firstName }: { firstName: string }) {
  const recommended = drivers.slice(0, 3);
  const stats = [
    { icon: Calendar, label: "Réservations", value: "3" },
    { icon: MessageSquare, label: "Conversations", value: String(conversations.length) },
    { icon: Heart, label: "Favoris", value: "2" },
    { icon: Star, label: "Note donnée", value: "4.9" },
  ];

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s, i) => (
          <StatCard key={s.label} {...s} delay={i * 0.05} />
        ))}
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        <Link href="/compte/reservations" className="btn-ghost text-sm">
          <Calendar className="h-4 w-4" /> Mes réservations
        </Link>
        <Link href="/messages" className="btn-ghost text-sm">
          <MessageSquare className="h-4 w-4" /> Messagerie
        </Link>
        <Link href="/drivers" className="btn-ghost text-sm">
          <Car className="h-4 w-4" /> Réserver une course
        </Link>
      </div>

      {/* Upcoming booking */}
      <Section title="Votre prochaine course" icon={Calendar}>
        <div className="flex flex-col gap-4 rounded-2xl glass p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Image
              src={drivers[0].avatar}
              alt={drivers[0].firstName}
              width={56}
              height={56}
              className="h-14 w-14 rounded-xl object-cover"
            />
            <div>
              <p className="font-semibold text-white">
                {drivers[0].firstName} {drivers[0].lastName}
              </p>
              <p className="text-sm text-white/50">
                {drivers[0].car.make} {drivers[0].car.model}
              </p>
              <p className="mt-1 flex items-center gap-2 text-xs text-white/40">
                <Clock className="h-3 w-3" /> Aujourd'hui · 14:30
                <MapPin className="ml-1 h-3 w-3" /> CDG → Le Marais
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/messages" className="btn-ghost text-sm">
              <MessageSquare className="h-4 w-4" /> Message
            </Link>
            <Link href={`/drivers/${drivers[0].id}`} className="btn-primary text-sm">
              Détails
            </Link>
          </div>
        </div>
      </Section>

      {/* Recent conversations */}
      <Section title="Conversations récentes" icon={MessageSquare} href="/messages">
        <div className="space-y-2">
          {conversations.map((c) => {
            const d = getDriver(c.driverId);
            if (!d) return null;
            return (
              <Link
                key={c.id}
                href="/messages"
                className="flex items-center gap-3 rounded-2xl glass p-3 transition hover:border-white/20"
              >
                <Image
                  src={d.avatar}
                  alt={d.firstName}
                  width={44}
                  height={44}
                  className="h-11 w-11 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-white">
                      {d.firstName} {d.lastName}
                    </p>
                    <span className="shrink-0 text-[11px] text-white/40">{c.time}</span>
                  </div>
                  <p className="truncate text-xs text-white/50">{c.lastMessage}</p>
                </div>
                {c.unread > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-royal-500 px-1.5 text-[10px] font-semibold text-white">
                    {c.unread}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </Section>

      {/* Recommended drivers */}
      <Section title="Recommandés pour vous" icon={Sparkles} href="/drivers">
        <div className="grid gap-4 sm:grid-cols-3">
          {recommended.map((d) => (
            <Link
              key={d.id}
              href={`/drivers/${d.id}`}
              className="group overflow-hidden rounded-2xl glass transition hover:border-white/20"
            >
              <div className="relative h-28">
                <Image
                  src={d.car.photos[0]}
                  alt={d.car.model}
                  fill
                  sizes="33vw"
                  className="object-cover transition group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink-900 to-transparent" />
              </div>
              <div className="p-3">
                <p className="text-sm font-semibold text-white">
                  {d.firstName} {d.lastName}
                </p>
                <div className="mt-1 flex items-center justify-between">
                  <StarRating value={d.rating} size={11} showValue />
                  <span className="text-xs font-medium text-white">€{d.pricePerHour}/h</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Section>
    </div>
  );
}

/* ───────────────────────── DRIVER ───────────────────────── */

function DriverDashboard({ driverId }: { driverId: string | null }) {
  const driver = driverId ? getDriver(driverId) : undefined;
  const [available, setAvailable] = useState(driver?.available ?? true);
  const city = driver ? getCity(driver.cityId) : undefined;

  if (!driver) {
    return (
      <div className="rounded-2xl glass p-8 text-center text-white/60">
        Profil chauffeur introuvable.
      </div>
    );
  }

  const estEarnings = Math.round(driver.trips * driver.pricePerHour * 0.18);
  const stats = [
    { icon: Car, label: "Courses", value: driver.trips.toLocaleString("fr-FR") },
    { icon: Star, label: "Note", value: driver.rating.toFixed(2) },
    { icon: MessageSquare, label: "Avis", value: String(driver.reviewsCount) },
    { icon: Wallet, label: "Revenus est.", value: `€${(estEarnings / 1000).toFixed(1)}k` },
  ];

  return (
    <div className="space-y-8">
      {/* Availability + profile */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex items-center gap-4 rounded-2xl glass p-5">
          <Image
            src={driver.avatar}
            alt={driver.firstName}
            width={64}
            height={64}
            className="h-16 w-16 rounded-2xl object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-white">
              {driver.car.make} {driver.car.model}
            </p>
            <p className="text-sm text-white/50">
              {city?.name} · {driver.car.year} · {driver.car.color}
            </p>
            <Link
              href={`/drivers/${driver.id}`}
              className="mt-1 inline-flex items-center gap-1 text-xs text-royal-300 hover:underline"
            >
              Voir mon profil public <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>

        <button
          onClick={() => setAvailable((a) => !a)}
          className={`flex items-center justify-between rounded-2xl border p-5 text-left transition ${
            available
              ? "border-emerald-400/30 bg-emerald-400/10"
              : "border-white/10 bg-white/[0.03]"
          }`}
        >
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <Power className={`h-4 w-4 ${available ? "text-emerald-400" : "text-white/40"}`} />
              {available ? "Vous êtes en ligne" : "Vous êtes hors ligne"}
            </p>
            <p className="mt-0.5 text-xs text-white/50">
              {available ? "Vous recevez des demandes" : "Touchez pour passer en ligne"}
            </p>
          </div>
          <span
            className={`relative h-7 w-12 shrink-0 rounded-full transition ${
              available ? "bg-emerald-500" : "bg-white/15"
            }`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${
                available ? "left-[22px]" : "left-0.5"
              }`}
            />
          </span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s, i) => (
          <StatCard key={s.label} {...s} delay={i * 0.05} />
        ))}
      </div>

      {/* Requests */}
      <Section title="Demandes de course" icon={TrendingUp}>
        <DriverRequests driverId={driver.id} />
      </Section>

      {/* Recent reviews */}
      <Section title="Vos derniers avis" icon={Star} href={`/drivers/${driver.id}`}>
        <div className="grid gap-4 sm:grid-cols-2">
          {driver.reviews.map((rev) => (
            <div key={rev.id} className="rounded-2xl glass p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">{rev.author}</p>
                <StarRating value={rev.rating} size={11} />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-white/60">“{rev.comment}”</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

/* ───────────────────────── SHARED ───────────────────────── */

function StatCard({
  icon: Icon,
  label,
  value,
  delay = 0,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="rounded-2xl glass p-4"
    >
      <Icon className="h-5 w-5 text-royal-400" />
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="text-xs text-white/40">{label}</p>
    </motion.div>
  );
}

function Section({
  title,
  icon: Icon,
  href,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-white">
          <Icon className="h-4 w-4 text-royal-400" />
          {title}
        </h2>
        {href && (
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-xs text-white/50 transition hover:text-white"
          >
            Tout voir <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
