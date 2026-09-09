"use client";

import Link from "next/link";
import { Sparkles, Instagram, Youtube, ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.5 3c.32 2.09 1.49 3.35 3.5 3.55v2.4c-1.17.11-2.28-.16-3.4-.79v5.86c0 3.2-2.4 5.98-5.72 5.98-2.9 0-5.28-2.11-5.28-5 0-3.13 2.62-5.33 6-4.82v2.62c-.42-.13-.88-.19-1.32-.13-1.16.14-2.06 1.03-2.06 2.28 0 1.32 1.02 2.32 2.34 2.32 1.4 0 2.42-1.08 2.42-2.58V3h3.52z" />
    </svg>
  );
}

export function Footer() {
  const { t } = useI18n();

  const groups = [
    {
      title: t("footer.platform"),
      links: [
        { label: t("footer.drivers"), href: "/drivers" },
        { label: t("nav.transfer"), href: "/transfert-aeroport" },
        { label: t("footer.becomeDriver"), href: "/auth/register?role=driver" },
        { label: t("footer.pricing"), href: "/#concept" },
      ],
    },
    {
      title: t("footer.cities"),
      links: [
        { label: t("footer.paris"), href: "/drivers?city=paris" },
      ],
    },
    {
      title: t("footer.company"),
      links: [
        { label: t("footer.about"), href: "/#concept" },
        { label: t("nav.contact"), href: "/contact" },
        { label: t("footer.privacy"), href: "/legal/confidentialite" },
        { label: t("footer.myData"), href: "/legal/mes-donnees" },
      ],
    },
  ];

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
                Nova <span className="text-royal-400">Compagnie</span>
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/50">
              {t("footer.tagline")}
            </p>
            <div className="mt-5 flex gap-3">
              {[
                { Icon: Instagram, href: "https://instagram.com", label: "Instagram" },
                { Icon: Youtube, href: "https://youtube.com", label: "YouTube" },
                { Icon: TikTokIcon, href: "https://tiktok.com", label: "TikTok" },
              ].map(({ Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
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
          <p>© {new Date().getFullYear()} Nova Compagnie · www.novacompagnie.com — {t("footer.copyright")}</p>
          <div className="flex flex-wrap items-center justify-center gap-6">
            <Link href="/legal/confidentialite" className="hover:text-white/70">{t("footer.privacy")}</Link>
            <Link href="/legal/conditions" className="hover:text-white/70">{t("footer.terms")}</Link>
            <Link href="/legal/cookies" className="hover:text-white/70">{t("footer.cookies")}</Link>
            <Link href="/legal/mentions-legales" className="hover:text-white/70">{t("footer.legal")}</Link>
            {/* Accès interne. Discret mais non caché : l'URL n'est pas un
                secret, c'est `requireAdmin()` qui protège la console. */}
            <Link
              href="/admin/login"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-white/35 transition hover:border-royal-400/30 hover:text-royal-300"
            >
              <ShieldCheck className="h-3 w-3" />
              {t("footer.admin")}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
