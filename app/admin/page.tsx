import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldAlert, Users, CalendarClock, Activity, ExternalLink } from "lucide-react";
import { requireAdmin, adminDb } from "@/lib/admin";
import { isStripeConfigured, isEmailConfigured } from "@/lib/config";
import { ApproveDriverButton } from "@/components/admin/ApproveDriverButton";

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

  // ── 20 dernières réservations ────────────────────────────────
  const { data: bookings, count: totalBookings } = await db
    .from("bookings")
    .select("id, client_id, driver_id, start_at, hours, total, status, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .limit(20);

  // Les noms viennent d'une seconde requête plutôt que d'un embed PostgREST :
  // bookings.driver_id pointe sur `drivers`, pas directement sur `profiles`.
  const ids = Array.from(
    new Set((bookings ?? []).flatMap((b) => [b.client_id, b.driver_id]).filter(Boolean))
  );
  const { data: people } = ids.length
    ? await db.from("profiles").select("id, first_name, last_name").in("id", ids)
    : { data: [] as { id: string; first_name: string; last_name: string }[] };

  const nameOf = (id: string) => {
    const p = people?.find((x) => x.id === id);
    const full = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim();
    return full || "—";
  };

  const pending = pendingDrivers ?? [];

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
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Kpi
            icon={CalendarClock}
            label="Total réservations"
            value={String(totalBookings ?? 0)}
          />
          <Kpi
            icon={Users}
            label="Chauffeurs en attente"
            value={String(pending.length)}
            tone={pending.length > 0 ? "warn" : "default"}
          />
          <div className="glass rounded-2xl p-6">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-white/45">
              <Activity className="h-3.5 w-3.5" />
              Statut système
            </p>
            <p className="mt-3 text-3xl font-bold text-emerald-400">Opérationnel</p>
            <p className="mt-2 text-[11px] text-white/40">
              Supabase ✓ · Stripe {isStripeConfigured ? "✓" : "—"} · E-mails{" "}
              {isEmailConfigured ? "✓" : "—"}
            </p>
          </div>
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
                    <th className="pb-3 text-right font-semibold">Action</th>
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
                      <td className="py-4 text-right">
                        <ApproveDriverButton driverId={d.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Réservations ────────────────────────────────────── */}
        <section className="glass rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white">Dernières réservations</h2>

          {!bookings || bookings.length === 0 ? (
            <div className="mt-5 space-y-2">
              <p className="text-sm italic text-white/40">Aucune réservation enregistrée.</p>
              <p className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs leading-relaxed text-white/45">
                ⚠️ Attendu en l&apos;état : les réservations vivent aujourd&apos;hui dans le broker
                en mémoire (<code>lib/bookingBroker.ts</code>) et ne sont jamais écrites dans la
                table <code>bookings</code>. Cette section restera vide tant que la persistance
                Supabase des courses n&apos;aura pas été branchée.
              </p>
            </div>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-white/35">
                    <th className="pb-3 font-semibold">ID / Date</th>
                    <th className="pb-3 font-semibold">Trajet</th>
                    <th className="pb-3 font-semibold">Statut</th>
                    <th className="pb-3 text-right font-semibold">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {bookings.map((b) => (
                    <tr key={b.id} className="transition hover:bg-white/[0.03]">
                      <td className="py-4 font-mono text-xs text-white/50">
                        {String(b.id).slice(0, 8)}…
                        <div className="mt-0.5 text-[11px] text-white/30">
                          {new Date(b.created_at).toLocaleDateString("fr-FR")}
                        </div>
                      </td>
                      <td className="py-4 text-sm">
                        <div className="max-w-xs truncate font-medium text-white">
                          {nameOf(b.client_id)} → {nameOf(b.driver_id)}
                        </div>
                        <div className="text-xs text-white/45">
                          {new Date(b.start_at).toLocaleString("fr-FR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}{" "}
                          · {b.hours} h
                        </div>
                      </td>
                      <td className="py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${
                            STATUS_TONE[b.status] ?? "bg-white/10 text-white/60"
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className="py-4 text-right text-sm font-semibold text-white">
                        {b.total ? `${b.total} €` : "Sur devis"}
                      </td>
                    </tr>
                  ))}
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
