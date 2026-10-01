import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ShieldAlert } from "lucide-react";
import { requireAdmin, adminDb } from "@/lib/admin";
import {
  listDocumentsForReview,
  logAdminAction,
  SIGNED_URL_TTL_SECONDS,
} from "@/lib/adminDocuments";
import { DriverReview } from "@/components/admin/DriverReview";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Vérification d'un chauffeur — Nova Compagnie",
  robots: { index: false },
};

/**
 * Écran de vérification des pièces d'un chauffeur.
 *
 * ## ⚠️ Les liens de consultation sont fabriqués ICI, à chaque ouverture
 *
 * Les documents vivent dans un bucket **privé**. Cette page demande à Supabase
 * une URL signée par pièce, valable 5 minutes, et la passe au composant
 * d'affichage. Trois conséquences à garder en tête :
 *
 * 1. **La clé de service ne quitte jamais le serveur** — le navigateur ne
 *    reçoit que des liens déjà signés, qui expirent.
 * 2. **Recharger la page renouvelle les liens.** Après cinq minutes, les
 *    images cessent de s'afficher : c'est le comportement attendu, pas une
 *    panne. L'écran le dit.
 * 3. **L'ouverture est journalisée** (`driver_documents_viewed`). C'est le
 *    moment où l'administrateur voit les pièces, donc le moment où la trace a
 *    un sens : en cas de litige, elle dit qui a consulté quoi, et quand.
 *
 * ⚠️ `requireAdmin()` d'abord, toujours. `listDocumentsForReview` ne contrôle
 * aucune identité — l'exposer sans garde publierait les permis de conduire et
 * les pièces d'identité de tous les chauffeurs.
 */
export default async function DriverReviewPage({
  params,
}: {
  params: { id: string };
}) {
  const guard = await requireAdmin();
  if (guard.state === "anonymous") redirect("/admin/login");
  if (guard.state === "forbidden") redirect("/admin/login?error=forbidden");
  if (guard.state !== "ok") {
    return (
      <main className="mx-auto max-w-2xl px-5 py-24">
        <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-6">
          <p className="flex items-center gap-2 font-semibold text-amber-200">
            <ShieldAlert className="h-5 w-5" /> Back-office indisponible
          </p>
          <p className="mt-2 text-sm text-amber-100/70">
            Supabase n&apos;est pas configuré, ou la clé de service manque.
          </p>
        </div>
      </main>
    );
  }

  const db = adminDb();
  if (!db) notFound();

  /**
   * ⚠️ Ce `select` ne demande QUE des colonnes d'origine.
   *
   * Il demandait aussi `rejection_reason`, ajoutée par la migration du
   * 2026-09-29. Avant qu'elle ne soit jouée, PostgREST répondait 400, `data`
   * valait `null`, et le `notFound()` plus bas transformait ça en **404** : la
   * page disait « ce chauffeur n'existe pas » alors qu'il manquait une colonne.
   * Un cul-de-sac de diagnostic, et la raison pour laquelle ce select reste
   * minimal — le motif de refus est lu séparément, et son absence est tolérée.
   */
  const { data } = await db
    .from("profiles")
    .select("id, email, first_name, last_name, phone, role, status, driver_slug, created_at")
    .eq("id", params.id)
    .maybeSingle();

  const profile = data as {
    id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    role: string;
    status: string;
    driver_slug: string | null;
    created_at: string;
  } | null;

  if (!profile || profile.role !== "driver") notFound();

  // Ce que le chauffeur a DÉCLARÉ — à comparer avec ce que montrent les pièces.
  const { data: driverRow } = await db
    .from("drivers")
    .select("licence_number, vtc_card_number, siret, categories, car_make, car_model, car_year, price_per_hour, price_per_day, onboarding_step")
    .eq("id", params.id)
    .maybeSingle();

  const { data: vehicleRow } = await db
    .from("vehicles")
    .select("make, model, year, plate")
    .eq("owner_id", params.id)
    .eq("is_primary", true)
    .maybeSingle();

  const { documents, schemaReady } = await listDocumentsForReview(params.id);

  // Motif du refus précédent : colonne de la migration, donc lue à part et
  // tolérée absente. S'en passer coûte une information, pas la page.
  let rejectionReason: string | null = null;
  if (schemaReady) {
    const { data: extra } = await db
      .from("profiles")
      .select("rejection_reason")
      .eq("id", params.id)
      .maybeSingle();
    rejectionReason =
      (extra as { rejection_reason: string | null } | null)?.rejection_reason ??
      null;
  }

  // La trace s'écrit au moment où les liens sont remis, donc où les pièces
  // deviennent consultables.
  await logAdminAction(guard.userId, "driver_documents_viewed", {
    driver_id: params.id,
    kinds: documents.map((d) => d.kind),
  });

  return (
    <main className="mx-auto max-w-5xl px-5 py-16 lg:px-8">
      <Link
        href="/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white"
      >
        <ChevronLeft className="h-4 w-4" /> Retour à la console
      </Link>

      <DriverReview
        driver={{
          id: profile.id,
          firstName: profile.first_name ?? "",
          lastName: profile.last_name ?? "",
          email: profile.email ?? "",
          phone: profile.phone ?? "",
          status: profile.status,
          slug: profile.driver_slug,
          rejectionReason,
          createdAt: profile.created_at,
        }}
        declared={{
          licenceNumber: (driverRow as Record<string, string> | null)?.licence_number ?? "",
          vtcCardNumber: (driverRow as Record<string, string> | null)?.vtc_card_number ?? "",
          siret: (driverRow as Record<string, string> | null)?.siret ?? "",
          vehicle: vehicleRow
            ? `${(vehicleRow as Record<string, string>).make} ${(vehicleRow as Record<string, string>).model} — ${(vehicleRow as Record<string, string>).plate}`
            : "",
        }}
        documents={documents}
        schemaReady={schemaReady}
        linkTtlSeconds={SIGNED_URL_TTL_SECONDS}
      />
    </main>
  );
}
