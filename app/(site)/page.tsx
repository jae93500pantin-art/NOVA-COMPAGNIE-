import Link from "next/link";
import { Search, MessagesSquare, CarFront, ShieldCheck, Sparkles, Clock, BadgeCheck, Lock } from "lucide-react";
import { Hero } from "@/components/Hero";
import { LiveMap } from "@/components/LiveMap";
import { CityShowcase } from "@/components/CityShowcase";
import { DriverCard } from "@/components/DriverCard";
import { SectionHeader } from "@/components/SectionHeader";
import { Reveal } from "@/components/Reveal";
import { drivers } from "@/lib/drivers";

const steps = [
  {
    icon: Search,
    title: "Recherchez",
    text: "Choisissez votre ville et explorez les chauffeurs disponibles en temps réel sur la carte.",
  },
  {
    icon: MessagesSquare,
    title: "Échangez",
    text: "Discutez en privé avec le chauffeur, précisez vos besoins et vos préférences.",
  },
  {
    icon: CarFront,
    title: "Réservez",
    text: "Confirmez votre trajet en quelques secondes. Paiement sécurisé, confirmation instantanée.",
  },
];

const features = [
  { icon: BadgeCheck, title: "Chauffeurs vérifiés", text: "Identité, permis et assurance contrôlés. Notes transparentes." },
  { icon: ShieldCheck, title: "Sécurité totale", text: "Suivi de trajet, contact d'urgence et assistance 24/7." },
  { icon: Sparkles, title: "Flotte premium", text: "Mercedes Classe S, Range Rover, Tesla, vans 7 places et plus." },
  { icon: Clock, title: "Réponse éclair", text: "Temps de réponse moyen inférieur à 5 minutes." },
  { icon: Lock, title: "Discrétion", text: "Confidentialité garantie, NDA disponible sur demande." },
  { icon: MessagesSquare, title: "Messagerie intégrée", text: "Coordonnez chaque détail directement dans l'app." },
];

export default function Home() {
  const featured = drivers.slice(0, 6);

  return (
    <>
      <Hero />

      {/* Live map */}
      <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <SectionHeader
            align="left"
            eyebrow="Carte en direct"
            title={<>Des chauffeurs autour de vous,<br /> en temps réel.</>}
            subtitle="Visualisez les chauffeurs disponibles comme jamais auparavant. Cliquez sur un pin pour découvrir le profil."
          />
          <Link href="/drivers" className="btn-ghost shrink-0 text-sm">
            Voir tous les chauffeurs
          </Link>
        </div>
        <Reveal>
          <LiveMap drivers={drivers} />
        </Reveal>
      </section>

      {/* Featured drivers */}
      <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <SectionHeader
          eyebrow="Sélection premium"
          title="Nos chauffeurs les mieux notés"
          subtitle="Une sélection rigoureuse de professionnels d'exception, plébiscités par nos clients."
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((d, i) => (
            <DriverCard key={d.id} driver={d} index={i} />
          ))}
        </div>
      </section>

      {/* Cities */}
      <section id="villes" className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <SectionHeader
          eyebrow="Villes disponibles"
          title="L'excellence, dans les plus belles villes"
          subtitle="LumeCar se déploie dans des destinations emblématiques. Paris, notre ville phare, puis Londres, Barcelone et New York."
        />
        <div className="mt-12">
          <CityShowcase />
        </div>
      </section>

      {/* How it works */}
      <section id="concept" className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <SectionHeader
          eyebrow="Comment ça marche"
          title="Trois étapes vers l'excellence"
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
                <p className="mt-2 text-sm leading-relaxed text-white/55">
                  {s.text}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Features grid */}
      <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <SectionHeader
          eyebrow="Pourquoi LumeCar"
          title="Une expérience pensée dans le moindre détail"
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
                Prêt à voyager autrement ?
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-white/60">
                Rejoignez les milliers de voyageurs qui ont choisi l'excellence.
                Créez votre compte en moins d'une minute.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href="/auth/register" className="btn-white">
                  Créer un compte client
                </Link>
                <Link
                  href="/auth/register?role=driver"
                  className="btn-ghost"
                >
                  Proposer mes services
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
