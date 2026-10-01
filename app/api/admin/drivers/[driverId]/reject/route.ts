import { NextResponse } from "next/server";
import { requireAdmin, adminDb } from "@/lib/admin";
import { adminRefusal } from "@/lib/adminHttp";
import { logAdminAction } from "@/lib/adminDocuments";
import { sendEmail, driverRejectedEmail } from "@/lib/email";
import {
  REJECTION_LABELS,
  isRejectionReason,
  rejectionError,
} from "@/lib/driverDocuments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Refus d'un dossier chauffeur, avec motif.
 *
 * ## ⚠️ Un refus n'est pas une exclusion
 *
 * Le compte repasse en `rejected` et le chauffeur **garde l'accès à son
 * tunnel** : il corrige et redépose. Supprimer le compte ou le suspendre le
 * forcerait à tout recommencer pour une carte grise floue — et personne ne
 * revient après ça.
 *
 * ⚠️ Le motif part dans l'e-mail. Un refus muet renvoie le chauffeur déposer
 * exactement la même pièce : `rejectionError` exige donc une précision quand le
 * motif est « Autre ».
 */

export async function POST(
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

  const note = typeof body.note === "string" ? body.note : "";
  const invalid = rejectionError(body.reason, note);
  if (invalid || !isRejectionReason(body.reason)) {
    return NextResponse.json({ error: invalid ?? "Motif invalide" }, { status: 400 });
  }
  const reason = body.reason;

  const { data, error: fetchError } = await db
    .from("profiles")
    .select("id, email, first_name, role, status")
    .eq("id", params.driverId)
    .maybeSingle();

  const driver = data as {
    id: string;
    email: string | null;
    first_name: string | null;
    role: string;
    status: string;
  } | null;

  if (fetchError || !driver) {
    return NextResponse.json({ error: "Chauffeur introuvable" }, { status: 404 });
  }
  if (driver.role !== "driver") {
    return NextResponse.json({ error: "Ce profil n'est pas un chauffeur" }, { status: 400 });
  }

  /**
   * ⚠️ Un chauffeur DÉJÀ VALIDÉ ne se refuse pas par cette route.
   *
   * Sa fiche est publique et des clients l'ont peut-être déjà contacté :
   * retirer un référencement actif est une autre décision (suspension), avec
   * d'autres conséquences. Refuser ici ne concerne qu'un dossier en attente.
   */
  if (driver.status === "approved") {
    return NextResponse.json(
      { error: "Ce chauffeur est déjà validé — utilisez une suspension." },
      { status: 409 }
    );
  }

  const trimmed = note.trim();
  const { error: updateError } = await db
    .from("profiles")
    .update({
      status: "rejected",
      rejection_reason: `${reason}${trimmed ? `: ${trimmed}` : ""}`,
      rejected_at: new Date().toISOString(),
    })
    .eq("id", params.driverId);

  if (updateError) {
    console.error(`[admin-reject] écriture refusée : ${updateError.message}`);
    return NextResponse.json({ error: "Enregistrement impossible" }, { status: 500 });
  }

  const origin = new URL(request.url).origin;
  const { subject, html } = driverRejectedEmail({
    firstName: driver.first_name || "Chauffeur",
    reasonLabel: REJECTION_LABELS[reason],
    note: trimmed,
    resumeUrl: `${origin}/compte/onboarding`,
  });
  const emailed = driver.email
    ? await sendEmail({ to: driver.email, subject, html })
    : false;

  await logAdminAction(guard.userId, "driver_rejected", {
    driver_id: params.driverId,
    reason,
    note: trimmed,
    emailed,
  });

  return NextResponse.json({
    success: true,
    emailed,
    message: emailed
      ? "Dossier refusé, le chauffeur a été prévenu"
      : "Dossier refusé (e-mail non envoyé)",
  });
}
