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
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { getDirectoryDriver, listDirectorySlugs } from "@/lib/driverDirectory";
import { hasVerifiedCnapsCard } from "@/lib/cnaps";
import { getCity } from "@/lib/cities";
import { Gallery } from "@/components/Gallery";
import { Reviews } from "@/components/Reviews";
import { BookingWidget } from "@/components/BookingWidget";
import { StarRating } from "@/components/StarRating";
import { DriverAvatar } from "@/components/DriverAvatar";
import { DriverVehicle } from "@/components/DriverVehicle";

/**
 * Les fiches sont pré-générées pour les chauffeurs déjà validés, et les
 * suivantes rendues à la demande (`dynamicParams` est vrai par défaut) : un
 * chauffeur validé après le build doit être joignable sans reconstruction.
 */
export async function generateStaticParams() {
  return (await listDirectorySlugs()).map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  const driver = await getDirectoryDriver(params.id);
  return {
    title: driver
      ? `${driver.firstName} ${driver.lastName} — Chauffeur privé · Nova Compagnie`
      : "Chauffeur — Nova Compagnie",
  };
}

export default async function DriverProfile({ params }: { params: { id: string } }) {
  // `getDirectoryDriver` ne rend que les chauffeurs VALIDÉS : un profil en
  // attente répond 404, il n'est pas encore public.
  const driver = await getDirectoryDriver(params.id);
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
              <DriverAvatar
                driverId={driver.id}
                avatar={driver.avatar}
                alt={driver.firstName}
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

              {/* Qualification personnelle du chauffeur — la seule forme sous
                  laquelle la carte CNAPS peut apparaître sur ce site.
                  ⚠️ La mention qui suit n'est pas décorative : la plateforme
                  encaisse la course et édite la facture, donc afficher une
                  compétence de sécurité sans dire ce qui est vendu ferait
                  glisser la fiche vers l'offre d'une prestation que Nova
                  Compagnie n'a pas le droit de commercialiser (art. L612-2
                  du Code de la sécurité intérieure). Voir lib/cnaps.ts. */}
              {hasVerifiedCnapsCard(driver) && (
                <div className="mt-4 rounded-2xl border border-royal-400/20 bg-royal-500/[0.06] p-3.5">
                  <span className="chip border-royal-400/40 bg-royal-500/15 text-royal-200">
                    <ShieldCheck className="h-3 w-3" /> Carte professionnelle
                    CNAPS vérifiée
                  </span>
                  <p className="mt-2 text-[11px] leading-relaxed text-white/45">
                    Carte délivrée par le CNAPS, vérifiée par notre équipe. Il
                    s&apos;agit d&apos;une qualification personnelle du
                    chauffeur. Nova Compagnie est une plateforme de mise en
                    relation VTC : votre réservation porte sur une course de
                    transport, et non sur une prestation de sécurité privée.
                  </p>
                </div>
              )}
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
              <DriverVehicle driver={driver} />
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
