import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ShieldAlert,
  Users,
  CalendarClock,
  Activity,
  ExternalLink,
  Star,
  Inbox,
} from "lucide-react";
import { DeleteDriverButton } from "@/components/admin/DeleteDriverButton";
import { DeleteReviewButton } from "@/components/admin/DeleteReviewButton";
import { QuoteActions, PurgeQuotesButton } from "@/components/admin/QuoteActions";
import { QUOTE_RETENTION_MONTHS, quoteRetentionCutoff } from "@/lib/quoteRequest";
// ⚠️ `ApproveDriverButton` n'est plus utilisé ici : la validation exige
// désormais d'avoir ouvert les pièces (voir /admin/chauffeurs/[id]).
import { requireAdmin, adminDb } from "@/lib/admin";
import { isEmailConfigured } from "@/lib/config";
import { formatAmount } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Administration — Nova Compagnie", robots: { index: false } };

/* -------------------------------------------------------------------------- */

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto mt-24 max-w-lg rounded-2xl border border-amber-400/25 bg-amber-400/5 p-6 text-center">
      <ShieldAlert className="mx-auto h-8 w-8 text-amber-400" />
      <h1 className="mt-4 text-lg font-semibold text-white">{title}</h1>
      <div className="mt-2 text-sm leading-relaxed text-white/55">{children}</div>
      <Link href="/" className="mt-6 inline-block text-sm text-royal-300 hover:text-royal-200">
        ← Retour à l&apos;accueil
      </Link>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof Users;
  label: string;
  value: string;
  tone?: "default" | "warn" | "ok";
}) {
  const toneClass =
    tone === "warn" ? "text-amber-400" : tone === "ok" ? "text-emerald-400" : "text-white";
  return (
    <div className="glass rounded-2xl p-6">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-white/45">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className={`mt-3 text-3xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  paid: "bg-emerald-400/10 text-emerald-400",
  completed: "bg-emerald-400/10 text-emerald-400",
  pending: "bg-amber-400/10 text-amber-400",
  confirmed: "bg-royal-400/10 text-royal-300",
  refused: "bg-red-400/10 text-red-400",
  cancelled: "bg-white/10 text-white/60",
};

/** Nombre d'avis listés dans la console. */
const REVIEWS_SHOWN = 100;

/** Demandes déjà traitées gardées sous les yeux (les non traitées sont toutes listées). */
const HANDLED_QUOTES_SHOWN = 30;

type QuoteRow = {
  id: string;
  driver_slug: string | null;
  name: string;
  email: string;
  phone: string;
  trip: string;
  details: string | null;
  handled_at: string | null;
  created_at: string;
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}

/* -------------------------------------------------------------------------- */

export default async function AdminDashboardPage() {
  const guard = await requireAdmin();

  if (guard.state === "anonymous") redirect("/admin/login");
  // Session valide mais sans le rôle : on le dit, au lieu de renvoyer
  // silencieusement à l'accueil — un admin qui s'est trompé de compte ne
  // comprenait pas ce qui venait de se passer.
  if (guard.state === "forbidden") redirect("/admin/login?error=forbidden");

  if (guard.state === "unconfigured") {
    return (
      <Notice title="Back-office indisponible">
        L&apos;administration nécessite une instance Supabase. Renseignez{" "}
        <code className="text-white/75">NEXT_PUBLIC_SUPABASE_URL</code> et{" "}
        <code className="text-white/75">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> dans{" "}
        <code className="text-white/75">.env.local</code>. Le reste du site continue de
        fonctionner en mode démo.
      </Notice>
    );
  }

  if (guard.state === "no-service-role") {
    return (
      <Notice title="Clé service role manquante">
        Le tableau de bord doit lire des lignes protégées par RLS. Ajoutez{" "}
        <code className="text-white/75">SUPABASE_SERVICE_ROLE_KEY</code> dans{" "}
        <code className="text-white/75">.env.local</code>, puis redémarrez le serveur.
      </Notice>
    );
  }

  const db = adminDb()!;

  // ── Chauffeurs en attente ────────────────────────────────────
  const { data: pendingDrivers, error: pendingError } = await db
    .from("profiles")
    .select("id, first_name, last_name, email, phone, created_at")
    .eq("role", "driver")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  // ── Chauffeurs validés ───────────────────────────────────────
  /**
   * ⚠️ Remplace la section « Dernières réservations », devenue vide de sens :
   * la table  n a plus ni ecrivain ni lecteur depuis le passage au
   * statut d annuaire. Afficher un compteur a zero et une explication sur un
   * broker supprime n aidait plus personne.
   */
  const { data: approvedDrivers } = await db
    .from("profiles")
    .select("id, first_name, last_name, email, phone, driver_slug, approved_at")
    .eq("role", "driver")
    .eq("status", "approved")
    .order("approved_at", { ascending: false });

  const approved = (approvedDrivers ?? []) as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    driver_slug: string | null;
    approved_at: string | null;
  }[];

  const pending = pendingDrivers ?? [];

  // ── Demandes de devis ────────────────────────────────────────
  /**
   * ⚠️ C'est le seul endroit où une demande se lit si l'e-mail de
   * notification n'est pas parti (domaine non vérifié chez Resend) : la route
   * publique enregistre en base AVANT d'envoyer. Sans cette section, une
   * demande non notifiée attendait une réponse que personne ne savait devoir
   * donner. Les non traitées sont TOUTES listées, les plus anciennes d'abord.
   */
  const QUOTE_COLUMNS = "id, driver_slug, name, email, phone, trip, details, handled_at, created_at";
  const [openQuotesRes, handledQuotesRes, expiredQuotesRes] = await Promise.all([
    db
      .from("quote_requests")
      .select(QUOTE_COLUMNS)
      .is("handled_at", null)
      .order("created_at", { ascending: true }),
    db
      .from("quote_requests")
      .select(QUOTE_COLUMNS)
      .not("handled_at", "is", null)
      .order("handled_at", { ascending: false })
      .limit(HANDLED_QUOTES_SHOWN),
    db
      .from("quote_requests")
      .select("id", { count: "exact", head: true })
      .lt("created_at", quoteRetentionCutoff().toISOString()),
  ]);
  const quotesError = openQuotesRes.error ?? handledQuotesRes.error;
  const openQuotes = (openQuotesRes.data ?? []) as QuoteRow[];
  const handledQuotes = (handledQuotesRes.data ?? []) as QuoteRow[];
  const expiredQuotes = expiredQuotesRes.count ?? 0;

  const quoteSlugs = Array.from(
    new Set(
      [...openQuotes, ...handledQuotes]
        .map((q) => q.driver_slug)
        .filter((x): x is string => !!x)
    )
  );
  const { data: quoteDriverRows } = quoteSlugs.length
    ? await db
        .from("profiles")
        .select("first_name, last_name, driver_slug")
        .in("driver_slug", quoteSlugs)
    : { data: [] };
  const quoteDrivers = new Map(
    (
      (quoteDriverRows ?? []) as {
        first_name: string | null;
        last_name: string | null;
        driver_slug: string;
      }[]
    ).map((p) => [p.driver_slug, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()])
  );

  // ── Avis publiés ─────────────────────────────────────────────
  /**
   * Les plus récents d'abord, plafonnés : la console sert à modérer ce qui
   * vient d'arriver, pas à relire tout l'historique.
   * ⚠️ `reviews.driver_id` est l'uuid du compte, pas le slug : le nom et la
   * fiche publique se retrouvent dans `profiles`, avec l'e-mail de l'auteur —
   * jamais publié, mais un modérateur en a besoin pour le joindre.
   */
  const { data: reviewRows, error: reviewsError } = await db
    .from("reviews")
    .select("id, driver_id, author_id, author_name, rating, comment, created_at")
    .order("created_at", { ascending: false })
    .limit(REVIEWS_SHOWN);

  const reviews = (reviewRows ?? []) as {
    id: string;
    driver_id: string;
    author_id: string | null;
    author_name: string | null;
    rating: number | string;
    comment: string;
    created_at: string;
  }[];

  const peopleIds = Array.from(
    new Set(
      reviews.flatMap((r) => [r.driver_id, r.author_id]).filter((x): x is string => !!x)
    )
  );
  const { data: peopleRows } = peopleIds.length
    ? await db
        .from("profiles")
        .select("id, first_name, last_name, email, driver_slug")
        .in("id", peopleIds)
    : { data: [] };
  const people = new Map(
    (
      (peopleRows ?? []) as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        driver_slug: string | null;
      }[]
    ).map((p) => [p.id, p])
  );
  const fullName = (id: string | null) => {
    const p = id ? people.get(id) : undefined;
    return p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : "";
  };

  return (
    <div className="min-h-screen-dvh bg-ink-950 pb-20">
      <header className="border-b border-white/10 bg-ink-900/60 px-6 py-6 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              Nova <span className="text-royal-300">Administration</span>
            </h1>
            <p className="mt-0.5 text-xs text-white/40">Console interne · accès restreint</p>
          </div>
          <span className="rounded-full bg-royal-400/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-royal-300">
            Mode admin
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-10 px-4 py-10 sm:px-6">
        {/* ── KPI ─────────────────────────────────────────────── */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            icon={CalendarClock}
            label="Chauffeurs référencés"
            value={String(approved.length)}
          />
          <Kpi
            icon={Users}
            label="Chauffeurs en attente"
            value={String(pending.length)}
            tone={pending.length > 0 ? "warn" : "default"}
          />
          <Kpi
            icon={Inbox}
            label="Devis non traités"
            value={String(openQuotes.length)}
            tone={openQuotes.length > 0 ? "warn" : "default"}
          />
          <div className="glass rounded-2xl p-6">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-white/45">
              <Activity className="h-3.5 w-3.5" />
              Statut système
            </p>
            <p className="mt-3 text-3xl font-bold text-emerald-400">Opérationnel</p>
            <p className="mt-2 text-[11px] text-white/40">
              Supabase ✓ · E-mails {isEmailConfigured ? "✓" : "—"}
            </p>
          </div>
        </section>

        {/* ── Demandes de devis ───────────────────────────────── */}
        <section className="glass rounded-2xl p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2.5 text-lg font-semibold text-white">
                Demandes de devis
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/70">
                  {openQuotes.length} à traiter
                </span>
              </h2>
              <p className="mt-1 text-xs text-white/40">
                Envoyées depuis les fiches chauffeurs. Transmettez-les au chauffeur choisi
                par le client, puis marquez-les traitées. Conservées{" "}
                {QUOTE_RETENTION_MONTHS} mois.
              </p>
            </div>
            {expiredQuotes > 0 && <PurgeQuotesButton count={expiredQuotes} />}
          </div>

          {quotesError ? (
            <p className="mt-5 rounded-xl border border-amber-400/25 bg-amber-400/5 p-4 text-sm text-amber-200/80">
              Impossible de lire les demandes de devis ({quotesError.message}).
            </p>
          ) : openQuotes.length + handledQuotes.length === 0 ? (
            <p className="mt-5 text-sm italic text-white/40">
              Aucune demande de devis pour le moment.
            </p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-white/35">
                    <th className="pb-3 font-semibold">Reçue le</th>
                    <th className="pb-3 font-semibold">Client</th>
                    <th className="pb-3 font-semibold">Chauffeur demandé</th>
                    <th className="pb-3 font-semibold">Trajet</th>
                    <th className="pb-3 text-right font-semibold">Suivi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {[...openQuotes, ...handledQuotes].map((q) => {
                    const handled = !!q.handled_at;
                    const driverName =
                      (q.driver_slug && quoteDrivers.get(q.driver_slug)) ||
                      q.driver_slug ||
                      "Chauffeur supprimé";
                    return (
                      <tr
                        key={q.id}
                        className={`align-top transition hover:bg-white/[0.03] ${
                          handled ? "opacity-55" : ""
                        }`}
                      >
                        <td className="whitespace-nowrap py-4 pr-4 text-sm text-white/60">
                          {formatDateTime(q.created_at)}
                          {handled && q.handled_at && (
                            <p className="mt-1 text-[11px] text-emerald-400/80">
                              Traitée le {formatDateTime(q.handled_at)}
                            </p>
                          )}
                        </td>
                        <td className="py-4 pr-4 text-sm">
                          <p className="font-medium text-white">{q.name}</p>
                          <a
                            href={`mailto:${q.email}`}
                            className="block text-xs text-royal-300 hover:underline"
                          >
                            {q.email}
                          </a>
                          <p className="text-xs text-white/55">{q.phone}</p>
                        </td>
                        <td className="py-4 pr-4 text-sm">
                          {q.driver_slug ? (
                            <a
                              href={`/drivers/${q.driver_slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-royal-300 hover:underline"
                            >
                              {driverName}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-white/50">{driverName}</span>
                          )}
                        </td>
                        <td className="max-w-md py-4 pr-4 text-sm leading-relaxed">
                          <p className="text-white/80">{q.trip}</p>
                          {q.details && (
                            <p className="mt-1 whitespace-pre-line text-xs text-white/50">
                              {q.details}
                            </p>
                          )}
                        </td>
                        <td className="py-4">
                          <div className="flex justify-end">
                            <QuoteActions quoteId={q.id} handled={handled} client={q.name} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {handledQuotes.length === HANDLED_QUOTES_SHOWN && (
            <p className="mt-3 text-[11px] text-white/30">
              Seules les {HANDLED_QUOTES_SHOWN} dernières demandes traitées sont affichées.
            </p>
          )}
        </section>

        {/* ── Chauffeurs en attente ───────────────────────────── */}
        <section className="glass rounded-2xl p-6">
          <h2 className="flex items-center gap-2.5 text-lg font-semibold text-white">
            Chauffeurs en attente de validation
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/70">
              {pending.length}
            </span>
          </h2>

          {pendingError ? (
            <p className="mt-5 rounded-xl border border-amber-400/25 bg-amber-400/5 p-4 text-sm text-amber-200/80">
              Impossible de lire les chauffeurs en attente ({pendingError.message}). La migration
              admin de <code>supabase/schema.sql</code> (rôle <code>admin</code> + colonnes{" "}
              <code>status</code>/<code>email</code>) n&apos;a probablement pas encore été exécutée.
            </p>
          ) : pending.length === 0 ? (
            <p className="mt-5 text-sm italic text-white/40">
              Aucun chauffeur en attente de validation pour le moment.
            </p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-white/35">
                    <th className="pb-3 font-semibold">Chauffeur</th>
                    <th className="pb-3 font-semibold">E-mail</th>
                    <th className="pb-3 font-semibold">Téléphone</th>
                    <th className="pb-3 font-semibold">Inscrit le</th>
                    <th className="pb-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {pending.map((d) => (
                    <tr key={d.id} className="transition hover:bg-white/[0.03]">
                      <td className="py-4 text-sm font-medium text-white">
                        {`${d.first_name ?? ""} ${d.last_name ?? ""}`.trim() || "—"}
                      </td>
                      <td className="py-4 text-sm text-white/60">{d.email ?? "—"}</td>
                      <td className="py-4 text-sm text-white/60">{d.phone || "Non renseigné"}</td>
                      <td className="py-4 text-sm text-white/45">
                        {new Date(d.created_at).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="py-4">
                        {/* ⚠️ Plus de validation en un clic depuis la liste.
                            Valider sans avoir ouvert les pièces est exactement
                            ce que la page publique promet de ne pas faire : le
                            seul chemin passe par l'écran de vérification. */}
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/admin/chauffeurs/${d.id}`}
                            className="btn-primary text-xs"
                          >
                            Vérifier le dossier
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                          {/* Un dossier qui n aboutira jamais — inscription
                              abandonnee, doublon, saisie de test — se retire
                              d ici, sinon la liste des « en attente » devient
                              illisible et plus personne ne la regarde. */}
                          <DeleteDriverButton
                            driverId={d.id}
                            name={`${d.first_name ?? ""} ${d.last_name ?? ""}`.trim()}
                            email={d.email ?? ""}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Chauffeurs validés ──────────────────────────────── */}
        <section className="glass rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white">
            Chauffeurs référencés
          </h2>
          <p className="mt-1 text-xs text-white/40">
            Dossiers validés, visibles dans l&apos;annuaire public.
          </p>

          {approved.length === 0 ? (
            <p className="mt-5 text-sm italic text-white/40">
              Aucun chauffeur référencé pour le moment.
            </p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-white/35">
                    <th className="pb-3 font-semibold">Chauffeur</th>
                    <th className="pb-3 font-semibold">E-mail</th>
                    <th className="pb-3 font-semibold">Fiche publique</th>
                    <th className="pb-3 font-semibold">Validé le</th>
                    <th className="pb-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {approved.map((d) => {
                    const name =
                      `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim() || "—";
                    return (
                      <tr key={d.id} className="transition hover:bg-white/[0.03]">
                        <td className="py-4 text-sm font-medium text-white">
                          {name}
                        </td>
                        <td className="py-4 text-sm text-white/60">
                          {d.email ?? "—"}
                        </td>
                        <td className="py-4 text-sm">
                          {d.driver_slug ? (
                            <a
                              href={`/drivers/${d.driver_slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-royal-300 hover:underline"
                            >
                              /{d.driver_slug}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            /* ⚠️ Validé sans slug : état incohérent que
                               `approve_driver` est censé rendre impossible
                               (les deux écritures sont dans une transaction).
                               S'il apparaît, rejouer la validation la répare. */
                            <span className="text-amber-300/80">slug manquant</span>
                          )}
                        </td>
                        <td className="py-4 text-sm text-white/45">
                          {d.approved_at
                            ? new Date(d.approved_at).toLocaleDateString("fr-FR")
                            : "—"}
                        </td>
                        <td className="py-4">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/admin/chauffeurs/${d.id}`}
                              className="btn-ghost text-xs"
                            >
                              Voir le dossier
                            </Link>
                            <DeleteDriverButton
                              driverId={d.id}
                              name={name}
                              email={d.email ?? ""}
                              approved
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Avis ──────────────────────────────────────────────── */}
        <section className="glass rounded-2xl p-6">
          <h2 className="flex items-center gap-2.5 text-lg font-semibold text-white">
            Avis publiés
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/70">
              {reviews.length}
            </span>
          </h2>
          <p className="mt-1 text-xs text-white/40">
            Les {REVIEWS_SHOWN} plus récents. Un retrait exige un motif et reste tracé —
            jamais en raison de la note : les mentions légales s&apos;y engagent.
          </p>

          {reviewsError ? (
            <p className="mt-5 rounded-xl border border-amber-400/25 bg-amber-400/5 p-4 text-sm text-amber-200/80">
              Impossible de lire les avis ({reviewsError.message}).
            </p>
          ) : reviews.length === 0 ? (
            <p className="mt-5 text-sm italic text-white/40">
              Aucun avis publié pour le moment.
            </p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-white/35">
                    <th className="pb-3 font-semibold">Chauffeur</th>
                    <th className="pb-3 font-semibold">Auteur</th>
                    <th className="pb-3 font-semibold">Note</th>
                    <th className="pb-3 font-semibold">Avis</th>
                    <th className="pb-3 font-semibold">Publié le</th>
                    <th className="pb-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {reviews.map((r) => {
                    const driver = people.get(r.driver_id);
                    const driverName = fullName(r.driver_id) || "Chauffeur supprimé";
                    const authorEmail = r.author_id ? people.get(r.author_id)?.email : null;
                    const authorName =
                      fullName(r.author_id) || r.author_name?.trim() || "Compte supprimé";
                    return (
                      <tr key={r.id} className="align-top transition hover:bg-white/[0.03]">
                        <td className="py-4 pr-4 text-sm">
                          {driver?.driver_slug ? (
                            <a
                              href={`/drivers/${driver.driver_slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-royal-300 hover:underline"
                            >
                              {driverName}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-white/70">{driverName}</span>
                          )}
                        </td>
                        <td className="py-4 pr-4 text-sm">
                          <p className="text-white">{authorName}</p>
                          {authorEmail && (
                            <p className="text-xs text-white/45">{authorEmail}</p>
                          )}
                        </td>
                        <td className="py-4 pr-4 text-sm text-white/80">
                          <span className="inline-flex items-center gap-1">
                            <Star className="h-3.5 w-3.5 fill-gold-400 text-gold-400" />
                            {Number(r.rating)}
                          </span>
                        </td>
                        <td className="max-w-md whitespace-pre-line py-4 pr-4 text-sm leading-relaxed text-white/65">
                          {r.comment}
                        </td>
                        <td className="whitespace-nowrap py-4 pr-4 text-sm text-white/45">
                          {new Date(r.created_at).toLocaleDateString("fr-FR")}
                        </td>
                        <td className="py-4">
                          <div className="flex justify-end">
                            <DeleteReviewButton
                              reviewId={r.id}
                              author={authorName}
                              driver={driverName}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="flex items-center gap-1.5 text-xs text-white/30">
          <ExternalLink className="h-3 w-3" />
          <Link href="/" className="hover:text-white/60">
            Retour au site
          </Link>
        </p>
      </main>
    </div>
  );
}
