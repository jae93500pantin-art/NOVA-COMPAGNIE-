"use client";

import Link from "next/link";
import {
  Sparkles,
  ShieldCheck,
  Mail,
  MessageCircle,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY } from "@/lib/contact";
import { whatsappUrl } from "@/lib/whatsapp";

export function Footer() {
  const { t } = useI18n();

  const groups = [
    {
      title: t("footer.platform"),
      links: [
        { label: t("footer.drivers"), href: "/drivers" },
        { label: t("nav.transfer"), href: "/transfert-aeroport" },
        { label: t("footer.becomeDriver"), href: "/auth/register?role=driver" },
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

            {/* Les coordonnées sur chaque page, pas seulement sur /contact :
                c'est le canal unique du support comme des demandes RGPD. */}
            <div className="mt-5 space-y-2">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="flex items-center gap-2 text-sm text-white/50 transition hover:text-white"
              >
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="break-all">{CONTACT_EMAIL}</span>
              </a>
              {/* ⚠️ WhatsApp, pas un lien d'appel : le numéro est une ligne
                  de messagerie, et un `tel:` renverrait vers une sonnerie
                  que personne ne décroche. */}
              <a
                href={whatsappUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-white/50 transition hover:text-white"
              >
                <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                WhatsApp {CONTACT_PHONE_DISPLAY}
              </a>
            </div>
            {/* ⚠️ Plus d'icônes Instagram / YouTube / TikTok : elles pointaient
                vers l'accueil générique de chaque réseau, pas vers un compte
                Nova. Un lien social qui ne mène à rien fait douter du reste.
                À remettre avec les URL des vrais comptes. */}
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
