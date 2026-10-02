import { NextResponse } from "next/server";
import { requireAdmin, adminDb } from "@/lib/admin";
import { adminRefusal } from "@/lib/adminHttp";
import { logAdminAction, DOCUMENTS_BUCKET } from "@/lib/adminDocuments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Suppression définitive d'un dossier chauffeur.
 *
 * ## ⚠️ Les fichiers du bucket NE CASCADENT PAS
 *
 * C'est le piège de cette route, et la raison principale de son existence.
 * Supprimer le compte `auth.users` efface en cascade `profiles`, `drivers`,
 * `vehicles` et `driver_documents` — mais **pas les fichiers** déposés dans le
 * stockage. Sans la boucle ci-dessous, les permis de conduire et les pièces
 * d'identité d'un chauffeur supprimé resteraient indéfiniment dans le bucket,
 * sans plus aucune ligne pour les désigner : une conservation de données
 * personnelles que plus rien ne justifie, et que personne ne retrouverait pour
 * la nettoyer.
 *
 * ⚠️ Les fichiers partent **avant** le compte : l'ordre inverse perdrait la
 * liste des chemins à supprimer avec la cascade.
 *
 * ## ⚠️ Deux comptes qu'on ne peut pas supprimer
 *
 * Un administrateur, et soi-même. Supprimer le seul compte `admin` fermerait
 * le back-office à clé, de l'intérieur, sans aucun moyen d'y revenir depuis le
 * site — la promotion ne peut venir que d'un script hors application.
 */

export async function DELETE(
  _request: Request,
  { params }: { params: { driverId: string } }
) {
  const guard = await requireAdmin();
  if (guard.state !== "ok") {
    const { status, error } = adminRefusal(guard.state);
    return NextResponse.json({ error }, { status });
  }

  const db = adminDb();
  if (!db) {
    return NextResponse.json({ error: "Client privilégié indisponible" }, { status: 503 });
  }

  const { driverId } = params;

  if (driverId === guard.userId) {
    return NextResponse.json(
      { error: "Vous ne pouvez pas supprimer votre propre compte." },
      { status: 400 }
    );
  }

  const { data } = await db
    .from("profiles")
    .select("id, email, first_name, last_name, role, status, driver_slug")
    .eq("id", driverId)
    .maybeSingle();

  const profile = data as {
    id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    role: string;
    status: string;
    driver_slug: string | null;
  } | null;

  if (!profile) {
    return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
  }
  if (profile.role === "admin") {
    return NextResponse.json(
      { error: "Un compte administrateur ne se supprime pas depuis cette console." },
      { status: 403 }
    );
  }

  // 1. Les pièces du stockage, AVANT la cascade qui effacerait leurs chemins.
  const { data: docs } = await db
    .from("driver_documents")
    .select("kind, storage_path")
    .eq("driver_id", driverId);

  const paths = ((docs ?? []) as { kind: string; storage_path: string }[]).map(
    (d) => d.storage_path
  );

  let filesRemoved = 0;
  if (paths.length > 0) {
    const { error: storageError } = await db.storage
      .from(DOCUMENTS_BUCKET)
      .remove(paths);
    if (storageError) {
      /**
       * ⚠️ On s'arrête ici, et c'est délibéré.
       *
       * Poursuivre supprimerait le compte en laissant les pièces d'identité
       * orphelines dans le bucket, sans plus aucune ligne pour les retrouver.
       * Mieux vaut un dossier encore présent, qu'on peut supprimer à nouveau,
       * qu'un fichier de pièce d'identité que personne ne sait plus localiser.
       */
      console.error(`[admin-delete] pièces non supprimées : ${storageError.message}`);
      return NextResponse.json(
        {
          error:
            "Les pièces justificatives n'ont pas pu être supprimées du stockage. Le dossier est conservé — réessayez.",
        },
        { status: 502 }
      );
    }
    filesRemoved = paths.length;
  }

  // 2. La trace AVANT la suppression : après, `profiles` n'existe plus et la
  //    clé étrangère de `audit_log` passerait à null.
  await logAdminAction(guard.userId, "driver_deleted", {
    driver_id: driverId,
    email: profile.email,
    name: `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim(),
    previous_status: profile.status,
    slug: profile.driver_slug,
    documents_removed: filesRemoved,
  });

  // 3. Le compte. `profiles`, `drivers`, `vehicles` et `driver_documents`
  //    suivent par `on delete cascade`.
  const { error: deleteError } = await db.auth.admin.deleteUser(driverId);
  if (deleteError) {
    console.error(`[admin-delete] compte non supprimé : ${deleteError.message}`);
    return NextResponse.json(
      { error: `Suppression impossible : ${deleteError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    filesRemoved,
    message:
      filesRemoved > 0
        ? `Dossier supprimé, ${filesRemoved} pièce(s) retirée(s) du stockage`
        : "Dossier supprimé",
  });
}
