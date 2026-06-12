import Link from "next/link";
import { Sparkles, Instagram, Linkedin, Twitter } from "lucide-react";

const groups = [
  {
    title: "Plateforme",
    links: [
      { label: "Chauffeurs", href: "/drivers" },
      { label: "Devenir chauffeur", href: "/auth/register?role=driver" },
      { label: "Messagerie", href: "/messages" },
      { label: "Tarifs", href: "/#concept" },
    ],
  },
  {
    title: "Villes",
    links: [
      { label: "Paris", href: "/drivers?city=paris" },
      { label: "Londres", href: "/drivers?city=london" },
      { label: "Barcelone", href: "/drivers?city=barcelona" },
      { label: "New York", href: "/drivers?city=newyork" },
    ],
  },
  {
    title: "Entreprise",
    links: [
      { label: "À propos", href: "/#concept" },
      { label: "Salon live", href: "/live" },
      { label: "Confidentialité", href: "/legal/confidentialite" },
      { label: "Mes données", href: "/legal/mes-donnees" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative mt-24 border-t border-white/5 bg-ink-950">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-royal-500/40 to-transparent" />
      <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-royal-400 to-royal-600 shadow-glow">
                <Sparkles className="h-4 w-4 text-white" />
              </span>
              <span className="text-lg font-semibold tracking-tight">
                Lume<span className="text-royal-400">Car</span>
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/50">
              L'expérience chauffeur privé réinventée. Des trajets d'exception,
              des professionnels vérifiés, une élégance sans compromis.
            </p>
            <div className="mt-5 flex gap-3">
              {[Instagram, Linkedin, Twitter].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-white/60 transition hover:bg-white/5 hover:text-white"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {groups.map((g) => (
            <div key={g.title}>
              <h4 className="text-sm font-semibold text-white">{g.title}</h4>
              <ul className="mt-4 space-y-3">
                {g.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-white/50 transition hover:text-white"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-8 text-xs text-white/40 sm:flex-row">
          <p>© {new Date().getFullYear()} LumeCar. Prototype de démonstration.</p>
          <div className="flex gap-6">
            <Link href="/legal/confidentialite" className="hover:text-white/70">Confidentialité</Link>
            <Link href="/legal/conditions" className="hover:text-white/70">Conditions</Link>
            <Link href="/legal/cookies" className="hover:text-white/70">Cookies</Link>
            <Link href="/legal/mentions-legales" className="hover:text-white/70">Mentions légales</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
