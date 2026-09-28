"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  MessageCircle,
  Car,
  Plane,
  ArrowRight,
  Power,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Loader2,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { whatsappUrl } from "@/lib/whatsapp";
import { initials } from "@/lib/utils";

/**
 * Espace personnel, côté client et côté chauffeur.
 *
 * ## ⚠️ Ce tableau de bord ne suit plus aucune course
 *
 * Statut d'annuaire. Ce qui a été retiré, et ne doit pas revenir :
 *
 * - côté client : les compteurs « Réservations 3 · Demandes 2 · Favoris 2 ·
 *   Note donnée 4.9 », la « prochaine course » et les chauffeurs
 *   « recommandés » — tous **inventés en dur**. Ils lisaient `drivers[0]` d'un
 *   annuaire désormais vide, donc cette page **plantait** pour un vrai client ;
 * - côté chauffeur : les demandes de course en direct (`DriverRequests`), les
 *   statistiques (courses, note, avis, revenus estimés — dérivées des valeurs
 *   par défaut de la base) et les derniers avis ;
 * - l'état « En course », qui se déduisait d'une réservation payée en cours.
 *
 * ⚠️ **Ne pas remplacer ces blocs par des chiffres de remplissage.** Un espace
 * personnel presque vide dit la vérité : la plateforme ne garde pas trace de
 * prestations qu'elle n'organise pas. Des compteurs inventés sur un site
 * marchand accessible, c'est la pratique commerciale trompeuse déjà nettoyée
 * une fois ici (voir CLAUDE.md, § Mock data).
 */
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
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
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

      <div className="mt-5 flex flex-wrap gap-2">
        {/* Un chauffeur n'a pas de fiche préexistante : le bouton l'envoie
            constituer son dossier, là où il se crée réellement. */}
        <Link
          href={user.role === "driver" ? "/compte/onboarding" : "/compte/profil"}
          className="btn-ghost text-sm"
        >
          {user.role === "driver" ? "Mon dossier chauffeur" : "Éditer mon profil"}
        </Link>
        <button onClick={signOut} className="btn-ghost text-sm">
          <LogOut className="h-4 w-4" /> Se déconnecter
        </button>
      </div>

      <div className="mt-8">
        {user.role === "driver" ? (
          <DriverSpace slug={user.driverId} />
        ) : (
          <ClientSpace />
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

function ClientSpace() {
  return (
    <div className="space-y-6">
      <Explainer>
        Nova Compagnie référence des chauffeurs indépendants vérifiés. Vous
        choisissez le vôtre, puis vous convenez de la prestation et du paiement{" "}
        <strong className="text-white/80">directement avec lui</strong> : la
        plateforme ne prend pas de réservation et n&apos;encaisse pas les
        courses. Vous ne trouverez donc pas d&apos;historique de courses ici.
      </Explainer>

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile
          href="/drivers"
          icon={Car}
          title="Annuaire"
          text="Parcourir les chauffeurs partenaires"
        />
        <Tile
          href="/transfert-aeroport"
          icon={Plane}
          title="Transfert aéroport"
          text="Qui dessert votre trajet"
        />
        <Tile
          href="/legal/mes-donnees"
          icon={ShieldCheck}
          title="Mes données"
          text="Export, effacement, consentements"
        />
      </div>

      <a
        href={whatsappUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-ghost text-sm"
      >
        <MessageCircle className="h-4 w-4 text-green-400" /> Contact WhatsApp
      </a>
    </div>
  );
}

/* ───────────────────────── CHAUFFEUR ───────────────────────── */

/**
 * ⚠️ `slug` est le `driver_slug` du compte, posé par un administrateur à la
 * validation. Tant qu'il est nul, le dossier n'est pas validé : il n'y a pas de
 * fiche publique à montrer, et c'est une information utile, pas une erreur.
 */
function DriverSpace({ slug }: { slug: string | null }) {
  /**
   * Interrupteur « en ligne ». ⚠️ Purement déclaratif et local depuis qu'il n'y
   * a plus de courses : plus d'état « En course » dérivé d'une réservation
   * payée en cours, puisqu'il n'existe plus de réservation. Il indique au
   * client si le chauffeur prend des demandes en ce moment.
   */
  const [available, setAvailable] = useState(true);

  return (
    <div className="space-y-6">
      <Explainer>
        Votre fiche est une{" "}
        <strong className="text-white/80">vitrine</strong> : les clients vous
        contactent, et vous convenez de la prestation, du prix définitif et du
        paiement avec eux. Nova ne prélève aucune commission sur vos courses et
        n&apos;encaisse pas vos clients.
      </Explainer>

      <button
        onClick={() => setAvailable((a) => !a)}
        className={`flex w-full items-center justify-between rounded-2xl border p-5 text-left transition ${
          available
            ? "border-emerald-400/30 bg-emerald-400/10"
            : "border-white/10 bg-white/[0.03]"
        }`}
      >
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-white">
            <Power
              className={`h-4 w-4 ${
                available ? "text-emerald-400" : "text-white/40"
              }`}
            />
            {available ? "Vous êtes en ligne" : "Vous êtes hors ligne"}
          </p>
          <p className="mt-0.5 text-xs text-white/50">
            {available
              ? "Votre fiche indique que vous prenez des demandes"
              : "Touchez pour repasser en ligne"}
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

      <div className="grid gap-3 sm:grid-cols-2">
        <Tile
          href="/compte/profil"
          icon={Car}
          title="Ma fiche"
          text="Véhicule, tarifs, disponibilités"
        />
        {slug ? (
          <Tile
            href={`/drivers/${slug}`}
            icon={ExternalLink}
            title="Ma fiche publique"
            text="Voir ce que voient les clients"
          />
        ) : (
          <Tile
            href="/compte/onboarding"
            icon={ShieldCheck}
            title="Dossier en cours"
            text="À compléter puis à valider par notre équipe"
          />
        )}
      </div>

      <a
        href={whatsappUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-ghost text-sm"
      >
        <MessageCircle className="h-4 w-4 text-green-400" /> Contact WhatsApp
      </a>
    </div>
  );
}

/* ───────────────────────── PARTAGÉ ───────────────────────── */

function Explainer({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm leading-relaxed text-white/60">
      {children}
    </p>
  );
}

function Tile({
  href,
  icon: Icon,
  title,
  text,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-2xl glass p-5 transition hover:border-white/20"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/5">
        <Icon className="h-5 w-5 text-royal-300" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-white">{title}</span>
        <span className="block text-xs text-white/45">{text}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-white/30 transition group-hover:translate-x-0.5 group-hover:text-white/60" />
    </Link>
  );
}
