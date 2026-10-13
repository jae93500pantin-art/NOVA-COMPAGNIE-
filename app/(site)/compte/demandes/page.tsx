import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox, Mail, Phone, Info, ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/config";
import { QUOTE_RETENTION_MONTHS, quoteRetentionCutoff } from "@/lib/quoteRequest";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mes demandes — Nova Compagnie", robots: { index: false } };

/** Plafond d'affichage : au-delà, la page devient un registre, pas un outil. */
const SHOWN = 200;

type Row = {
  id: string;
  name: string;
  email: string;
  phone: string;
  trip: string;
  details: string | null;
  created_at: string;
};

/**
 * Demandes de devis reçues par le chauffeur connecté.
 *
 * ## ⚠️ Lecture en service role, filtrée par l'identité de SESSION
 *
 * `quote_requests` a la RLS activée **sans aucune policy** — c'est sa
 * protection (elle porte les coordonnées de particuliers). On n'en ajoute pas
 * une de lecture « pour le chauffeur » : ce serait une seconde porte sur
 * PostgREST. La page lit donc côté serveur, et le filtre `driver_id` vient de
 * `requireUser()` (cookie revalidé), jamais d'un paramètre d'URL.
 * `quote_requests.driver_id` = `drivers.id` = `profiles.id` = l'uuid du compte.
 *
 * ## ⚠️ Lecture seule, aucun prix
 *
 * Le chauffeur répond au client par ses propres moyens, avec son propre tarif.
 * Pas de bouton « accepter », pas de montant, pas de statut de course : la
 * plateforme ne prend pas de réservation (§ STATUT D'ANNUAIRE). Le suivi
 * « traitée » (`handled_at`) reste celui de Nova dans la console.
 */
export default async function DriverQuotesPage() {
  const user = await requireUser("/compte/demandes");

  // Mode démo (sans Supabase) : aucune demande ne peut exister.
  if (!user || !isSupabaseAdminConfigured) {
    return (
      <Shell>
        <Empty>Les demandes de devis nécessitent la base de données, absente en mode démo.</Empty>
      </Shell>
    );
  }
  if (user.role !== "driver") redirect("/compte");

  const db = getSupabaseAdmin();
  const { data, error } = db
    ? await db
        .from("quote_requests")
        .select("id, name, email, phone, trip, details, created_at")
        .eq("driver_id", user.id)
        .gte("created_at", quoteRetentionCutoff().toISOString())
        .order("created_at", { ascending: false })
        .limit(SHOWN)
    : { data: null, error: { message: "client indisponible" } };

  const rows = (data ?? []) as Row[];

  return (
    <Shell>
      {error ? (
        <p className="rounded-2xl border border-amber-400/25 bg-amber-400/5 p-5 text-sm text-amber-200/80">
          Vos demandes ne peuvent pas être affichées pour le moment. Réessayez plus tard.
        </p>
      ) : rows.length === 0 ? (
        <Empty>
          {user.driverSlug
            ? "Aucune demande pour l'instant. Elles apparaîtront ici dès qu'un client remplira le formulaire de votre fiche."
            : "Votre fiche n'est pas encore publiée : les clients pourront vous écrire une fois votre dossier validé."}
        </Empty>
      ) : (
        <ul className="space-y-3">
          {rows.map((q) => (
            <li key={q.id} className="glass rounded-2xl p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-white">{q.name}</p>
                <p className="text-xs text-white/40">
                  {new Date(q.created_at).toLocaleString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Europe/Paris",
                  })}
                </p>
              </div>
              <p className="mt-2 text-sm text-white/80">{q.trip}</p>
              {q.details && (
                <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-white/55">
                  {q.details}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={`mailto:${q.email}`} className="btn-ghost text-xs">
                  <Mail className="h-3.5 w-3.5" />
                  {q.email}
                </a>
                <a href={`tel:${q.phone.replace(/[^\d+]/g, "")}`} className="btn-ghost text-xs">
                  <Phone className="h-3.5 w-3.5" />
                  {q.phone}
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-5 pb-16 pt-28 lg:px-8 lg:pt-32">
      <Link
        href="/compte"
        className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white/70"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Mon espace
      </Link>
      <h1 className="mt-4 flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-white">
        <Inbox className="h-6 w-6 text-royal-300" />
        Mes demandes de devis
      </h1>
      <p className="mt-4 flex gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-xs leading-relaxed text-white/55">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-royal-300" />
        <span>
          Demandes envoyées par des clients depuis votre fiche. Répondez-leur
          directement, avec <strong className="text-white/75">votre propre tarif</strong> :
          Nova ne fixe pas le prix, ne réserve rien et n&apos;encaisse rien. Ces
          coordonnées ne servent qu&apos;à répondre à la demande ; elles
          disparaissent d&apos;ici au bout de {QUOTE_RETENTION_MONTHS} mois.
        </span>
      </p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm italic text-white/40">{children}</p>;
}
