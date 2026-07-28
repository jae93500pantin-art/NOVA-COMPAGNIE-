import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  MapPin,
  Languages,
  CalendarClock,
  Car,
  BadgeCheck,
  Clock,
  Sparkles,
} from "lucide-react";
import { drivers, getDriver } from "@/lib/drivers";
import { getCity } from "@/lib/cities";
import { Gallery } from "@/components/Gallery";
import { Reviews } from "@/components/Reviews";
import { BookingWidget } from "@/components/BookingWidget";
import { StarRating } from "@/components/StarRating";

export function generateStaticParams() {
  return drivers.map((d) => ({ id: d.id }));
}

export function generateMetadata({ params }: { params: { id: string } }) {
  const driver = getDriver(params.id);
  return {
    title: driver
      ? `${driver.firstName} ${driver.lastName} — Chauffeur privé · Nova Compagnie`
      : "Chauffeur — Nova Compagnie",
  };
}

export default function DriverProfile({ params }: { params: { id: string } }) {
  const driver = getDriver(params.id);
  if (!driver) notFound();
  const city = getCity(driver.cityId);

  const facts = [
    { icon: CalendarClock, label: "Expérience", value: `${driver.experienceYears} ans` },
    { icon: Car, label: "Trajets", value: driver.trips.toLocaleString("fr-FR") },
    { icon: Clock, label: "Réponse", value: driver.responseTime },
    { icon: MapPin, label: "Ville", value: city?.name ?? "" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-5 pb-16 pt-28 lg:px-8 lg:pt-32">
      <Link
        href="/drivers"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white"
      >
        <ChevronLeft className="h-4 w-4" />
        Retour aux chauffeurs
      </Link>

      <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
        {/* Left column */}
        <div>
          {/* Identity header */}
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-3xl border-2 border-white/15 shadow-card">
              <Image
                src={driver.avatar}
                alt={driver.firstName}
                fill
                sizes="96px"
                className="object-cover"
              />
            </div>
            <div className="flex-1">
              <h1 className="flex flex-wrap items-center gap-2 text-3xl font-semibold tracking-tight text-white">
                {driver.firstName} {driver.lastName}
                {driver.badges.includes("Top Pro") && (
                  <BadgeCheck className="h-6 w-6 text-royal-400" />
                )}
                <span className="text-lg font-normal text-white/40">
                  · {driver.age} ans
                </span>
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/60">
                <StarRating value={driver.rating} size={14} showValue />
                <span className="text-white/40">{driver.reviewsCount} avis</span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {city?.name}, {city?.country}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {driver.badges.map((b) => (
                  <span key={b} className="chip border-royal-400/20 bg-royal-500/10 text-royal-200">
                    <Sparkles className="h-3 w-3" /> {b}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Gallery */}
          <div className="mt-8">
            <Gallery
              photos={driver.car.photos}
              alt={`${driver.car.make} ${driver.car.model}`}
              driverId={driver.id}
            />
          </div>

          {/* Facts */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {facts.map((f) => (
              <div key={f.label} className="rounded-2xl glass p-4">
                <f.icon className="h-5 w-5 text-royal-400" />
                <p className="mt-2 text-lg font-semibold text-white">{f.value}</p>
                <p className="text-xs text-white/40">{f.label}</p>
              </div>
            ))}
          </div>

          {/* Vehicle */}
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-white">Le véhicule</h2>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-2xl glass p-5">
              <div>
                <p className="text-base font-medium text-white">
                  {driver.car.make} {driver.car.model}
                </p>
                <p className="text-sm text-white/50">
                  {driver.car.year} · {driver.car.color}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {driver.categories.map((c) => (
                  <span key={c} className="chip">{c}</span>
                ))}
              </div>
            </div>
          </section>

          {/* Languages */}
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-white">Langues parlées</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {driver.languages.map((l) => (
                <span key={l} className="chip">
                  <Languages className="h-3 w-3" /> {l}
                </span>
              ))}
            </div>
          </section>

          {/* Bio */}
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-white">À propos</h2>
            <p className="mt-3 leading-relaxed text-white/65">{driver.bio}</p>
          </section>

          {/* Reviews */}
          <section className="mt-10">
            <h2 className="mb-5 text-lg font-semibold text-white">
              Avis & commentaires
            </h2>
            <Reviews driver={driver} />
          </section>
        </div>

        {/* Right column — booking */}
        <div>
          <BookingWidget driver={driver} />
        </div>
      </div>
    </div>
  );
}
