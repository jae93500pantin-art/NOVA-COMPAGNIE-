import { NextResponse } from "next/server";
import { requireAdmin, adminDb } from "@/lib/admin";
import { adminRefusal } from "@/lib/adminHttp";
import { logAdminAction } from "@/lib/adminDocuments";
import { REVIEW_REMOVAL_LABELS, reviewRemovalError } from "@/lib/reviews";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Retrait d'un avis par un administrateur (modération).
 *
 * ## ⚠️ Un motif, toujours, et jamais la note
 *
 * L'auteur retire son propre avis par `/api/reviews/[driverId]`. Ici, c'est la
 * plateforme qui retire l'avis de quelqu'un d'autre : c'est une décision qui
 * doit pouvoir se justifier. Le motif vient d'une liste fermée
 * (`REVIEW_REMOVAL_REASONS`) qui ne contient aucun critère de note — retirer
 * les avis défavorables fausserait la moyenne publiée, et les mentions légales
 * promettent le contraire.
 *
 * ## ⚠️ La trace s'écrit AVANT la suppression, avec le texte
 *
 * Après, l'avis n'existe plus nulle part : si l'auteur demande pourquoi son avis
 * a disparu, ou si le chauffeur conteste, le journal est la seule pièce qui
 * reste. Il garde donc le commentaire et la note, en plus du motif.
 *
 * ⚠️ Suppression réelle, comme pour l'auteur : un avis « masqué » resterait
 * compté par tout chemin de lecture qui oublierait le drapeau.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  request: Request,
  { params }: { params: { reviewId: string } }
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

  const { reviewId } = params;
  // Un id mal formé ferait répondre PostgREST 22P02, lu comme une panne.
  if (!UUID_RE.test(reviewId)) {
    return NextResponse.json({ error: "Avis introuvable" }, { status: 404 });
  }

  let body: { reason?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête illisible" }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note : "";
  const invalid = reviewRemovalError(body.reason, note);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const reason = body.reason as keyof typeof REVIEW_REMOVAL_LABELS;

  const { data, error: readError } = await db
    .from("reviews")
    .select("id, driver_id, author_id, author_name, rating, comment, created_at")
    .eq("id", reviewId)
    .maybeSingle();

  if (readError) {
    console.error(`[admin-reviews] lecture impossible : ${readError.message}`);
    return NextResponse.json({ error: "Lecture de l'avis impossible" }, { status: 500 });
  }
  const review = data as {
    id: string;
    driver_id: string;
    author_id: string | null;
    author_name: string | null;
    rating: number | string;
    comment: string;
    created_at: string;
  } | null;
  if (!review) {
    return NextResponse.json({ error: "Avis introuvable" }, { status: 404 });
  }

  await logAdminAction(guard.userId, "review_removed", {
    review_id: review.id,
    driver_id: review.driver_id,
    author_id: review.author_id,
    author_name: review.author_name,
    rating: Number(review.rating),
    comment: review.comment,
    created_at: review.created_at,
    reason,
    reason_label: REVIEW_REMOVAL_LABELS[reason],
    note: note.trim() || null,
  });

  const { error } = await db.from("reviews").delete().eq("id", review.id);
  if (error) {
    console.error(`[admin-reviews] suppression refusée : ${error.message}`);
    return NextResponse.json({ error: "L'avis n'a pas pu être supprimé." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
