import Link from "next/link";
import { ChevronLeft } from "lucide-react";

const legalLinks = [
  { href: "/legal/confidentialite", label: "Confidentialité" },
  { href: "/legal/conditions", label: "Conditions d’utilisation" },
  { href: "/legal/cookies", label: "Cookies" },
  { href: "/legal/mentions-legales", label: "Mentions légales" },
  { href: "/legal/mes-donnees", label: "Mes données" },
];

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl px-5 pb-16 pt-28 lg:px-8 lg:pt-32">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white"
      >
        <ChevronLeft className="h-4 w-4" />
        Retour à l’accueil
      </Link>

      <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
        <aside className="h-fit lg:sticky lg:top-28">
          <p className="mb-3 text-xs uppercase tracking-wider text-white/40">
            Informations légales
          </p>
          <nav className="flex flex-col gap-1">
            {legalLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-xl px-3 py-2 text-sm text-white/60 transition hover:bg-white/5 hover:text-white"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </aside>

        <article className="prose-legal max-w-none">{children}</article>
      </div>
    </div>
  );
}
