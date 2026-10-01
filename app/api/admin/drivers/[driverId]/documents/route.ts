import { NextResponse } from "next/server";
import { requireAdmin, adminDb } from "@/lib/admin";
import { adminRefusal } from "@/lib/adminHttp";
import { logAdminAction } from "@/lib/adminDocuments";

/**
 * Contrôle d'UNE pièce par un administrateur : « Conforme » et échéance.
 *
 * ⚠️ `checked_ok` n'est pas un doublon de `status`. `status` décrit le cycle du
 * fichier ('pending' → 'approved'), et le trigger `driver_documents_reset_review`
 * le remet à 'pending' dès qu'un fichier est remplacé. `checked_ok` est la case
 * que l'administrateur coche **après avoir regardé le document** — c'est elle
 * que le bouton « Valider » consulte. Sans cette distinction, déposer un
 * fichier vide suffirait à faire valider un dossier.
 *
 * ⚠️ Écrit avec le service role, **après** `requireAdmin()` : la RLS réserve
 * `driver_documents` à son propriétaire, et un administrateur n'est le
 * propriétaire de rien.
 */

/** "YYYY-MM-DD", ou null. Une date libre finirait en `invalid date` en base. */
function expiryOrNull(raw: unknown): string | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split("-").map(Number);
  const probe = new Date(y, m - 1, d);
  const real =
    probe.getFullYear() === y &&
    probe.getMonth() === m - 1 &&
    probe.getDate() === d;
  return real ? raw : null;
}

export async function PATCH(
  request: Request,
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps illisible" }, { status: 400 });
  }

  const documentId = typeof body.documentId === "string" ? body.documentId : "";
  if (!documentId) {
    return NextResponse.json({ error: "Pièce non identifiée" }, { status: 400 });
  }

  /**
   * ⚠️ La pièce doit appartenir au chauffeur de l'URL.
   *
   * Sans cette lecture, un identifiant de pièce suffirait à cocher « conforme »
   * sur le dossier d'un autre chauffeur — l'URL dirait une chose et l'écriture
   * en ferait une autre.
   */
  const { data: doc } = await db
    .from("driver_documents")
    .select("id, kind, driver_id")
    .eq("id", documentId)
    .maybeSingle();

  const target = doc as { id: string; kind: string; driver_id: string } | null;
  if (!target || target.driver_id !== params.driverId) {
    return NextResponse.json({ error: "Pièce introuvable" }, { status: 404 });
  }

  const checkedOk = body.checkedOk === true;
  const expiresAt = expiryOrNull(body.expiresAt);

  const { error } = await db
    .from("driver_documents")
    .update({
      checked_ok: checkedOk,
      expires_at: expiresAt,
      // La décision sur la pièce suit la case, pour que les deux ne divergent
      // pas : décocher rend la pièce à l'examen.
      status: checkedOk ? "approved" : "pending",
      checked_by: checkedOk ? guard.userId : null,
      checked_at: checkedOk ? new Date().toISOString() : null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  if (error) {
    console.error(`[admin-docs] contrôle non enregistré : ${error.message}`);
    return NextResponse.json({ error: "Enregistrement impossible" }, { status: 500 });
  }

  await logAdminAction(guard.userId, "driver_document_checked", {
    driver_id: params.driverId,
    kind: target.kind,
    checked_ok: checkedOk,
    expires_at: expiresAt,
  });

  return NextResponse.json({ ok: true, checkedOk, expiresAt });
}
