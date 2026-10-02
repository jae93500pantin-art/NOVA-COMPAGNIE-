import { NextRequest } from "next/server";
import { getServerUser } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/config";
import { rateLimit, sanitizeText } from "@/lib/validation";
import { getDirectoryDriverAccountId } from "@/lib/driverDirectory";
import {
  COMMENT_MAX,
  REVIEW_ERRORS,
  reviewAuthorError,
  reviewContentError,
  reviewSignature,
  type Review,
} from "@/lib/reviews";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Avis d'une fiche chauffeur.
 *
 *   GET  → la liste, **publique** (aucune session requise).
 *   POST → dépose un avis, **compte client uniquement**.
 *
 * ## ⚠️ L'asymétrie est le cœur de cette route
 *
 * Lire est libre : l'annuaire se consulte sans compte, et des avis qu'il faut
 * un compte pour lire ne servent à personne. Écrire exige un compte, et c'est
 * le seul garde-fou qui reste contre le faux avis depuis que la réservation a
 * disparu — il ne prouve rien, il rend l'auteur traçable et empêche le dépôt
 * en masse. ⚠️ Ne jamais présenter cet avis comme « vérifié » : voir
 * `lib/reviews.ts`.
 *
 * ## ⚠️ L'auteur vient de la SESSION, jamais du corps de la requête
 *
 * Un `authorId` envoyé par le navigateur permettrait de signer l'avis de
 * n'importe qui — y compris d'un chauffeur concurrent, ou de « Support Nova ».
 * Le nom affiché est dérivé de `profiles`, pas d'un champ du formulaire.
 *
 * ## ⚠️ Le rôle est lu dans `profiles`, pas dans `user_metadata`
 *
 * `getServerUser()` le lit déjà dans la table, où le trigger
 * `profiles_protect_privileged` le verrouille. Un rôle pris dans les
 * métadonnées serait réécrit par l'utilisateur lui-même en un appel.
 */

interface ReviewRow {
  id: string;
  author_id: string | null;
  author_name: string | null;
  rating: number | string;
  comment: string;
  created_at: string;
}

function db() {
  return isSupabaseAdminConfigured ? getSupabaseAdmin() : null;
}

function ipOf(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * `numeric` revient de PostgREST en **chaîne**. Recopié tel quel, un `rating`
 * casserait toute comparaison et toute moyenne — le même piège que
 * `lib/dbRows.ts` neutralisait pour les totaux de réservation.
 */
function rowToReview(row: ReviewRow, driverSlug: string): Review {
  return {
    id: row.id,
    driverId: driverSlug,
    authorId: row.author_id,
    authorName: row.author_name?.trim() || "Client Nova",
    rating: Number(row.rating),
    comment: row.comment,
    createdAt: row.created_at,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { driverId: string } }
) {
  const client = db();
  // ⚠️ Sans clé de service, on rend une liste vide et non une erreur : la
  // fiche doit rester lisible, comme l'annuaire reste vide plutôt qu'en panne.
  if (!client) return Response.json({ reviews: [] });

  const driverUuid = await getDirectoryDriverAccountId(params.driverId);
  if (!driverUuid) return Response.json({ reviews: [] });

  const { data, error } = await client
    .from("reviews")
    .select("id, author_id, author_name, rating, comment, created_at")
    .eq("driver_id", driverUuid)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error(`[reviews] lecture refusée : ${error.message}`);
    return Response.json({ reviews: [] });
  }

  return Response.json({
    reviews: (data as ReviewRow[]).map((r) => rowToReview(r, params.driverId)),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { driverId: string } }
) {
  if (!rateLimit(`review:${ipOf(req)}`, 5, 60_000).ok) {
    return Response.json({ error: "Trop de tentatives" }, { status: 429 });
  }

  const client = db();
  if (!client) {
    return Response.json(
      { error: "Publication indisponible : la base n'est pas configurée." },
      { status: 503 }
    );
  }

  const session = await getServerUser();
  /**
   * ⚠️ En mode démo (aucune clé Supabase), le serveur ne voit aucune session —
   * la session de démonstration vit dans le localStorage. On refuse plutôt que
   * d'accepter un avis anonyme : un avis est le seul contenu public qu'un
   * visiteur peut écrire sur un professionnel réel, et il porte une
   * signature. Mieux vaut une démo qui explique qu'une porte ouverte.
   */
  if (session.state !== "ok") {
    return Response.json({ error: REVIEW_ERRORS.notSignedIn }, { status: 401 });
  }

  const driverUuid = await getDirectoryDriverAccountId(params.driverId);
  // Même 404 pour un slug inconnu et pour une fiche non publiable : distinguer
  // les deux renseignerait sur l'existence d'un dossier en attente.
  if (!driverUuid) {
    return Response.json({ error: "Chauffeur introuvable" }, { status: 404 });
  }
  // ⚠️ Un chauffeur ne s'évalue pas lui-même. Le contrôle de rôle l'écarte
  // déjà, mais celui-ci reste lisible et survivrait à un changement de rôle.
  if (driverUuid === session.user.id) {
    return Response.json({ error: REVIEW_ERRORS.notClient }, { status: 403 });
  }

  let body: { rating?: unknown; comment?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Requête invalide" }, { status: 400 });
  }

  const draft = {
    rating: Number(body.rating),
    comment: sanitizeText(body.comment, COMMENT_MAX),
  };

  const contentError = reviewContentError(draft);
  if (contentError) {
    return Response.json({ error: REVIEW_ERRORS[contentError] }, { status: 400 });
  }

  const { data: existing } = await client
    .from("reviews")
    .select("id")
    .eq("driver_id", driverUuid)
    .eq("author_id", session.user.id)
    .maybeSingle();

  const authorError = reviewAuthorError({
    signedIn: true,
    role: session.user.role,
    alreadyReviewed: Boolean(existing),
  });
  if (authorError) {
    return Response.json(
      { error: REVIEW_ERRORS[authorError] },
      { status: authorError === "duplicate" ? 409 : 403 }
    );
  }

  const authorName = reviewSignature(
    session.user.firstName,
    session.user.lastName
  );

  const { data, error } = await client
    .from("reviews")
    .insert({
      driver_id: driverUuid,
      author_id: session.user.id,
      author_name: authorName,
      rating: draft.rating,
      comment: draft.comment.trim(),
    })
    .select("id, author_id, author_name, rating, comment, created_at")
    .maybeSingle();

  if (error || !data) {
    /**
     * ⚠️ L'index unique `reviews_one_per_author_driver` est le dernier mot : la
     * vérification ci-dessus laisse une fenêtre entre la lecture et
     * l'insertion, et deux soumissions simultanées la franchiraient. Le code
     * `23505` est donc traduit en refus métier, pas en panne.
     */
    if (error?.code === "23505") {
      return Response.json({ error: REVIEW_ERRORS.duplicate }, { status: 409 });
    }
    console.error(`[reviews] publication refusée : ${error?.message}`);
    return Response.json(
      { error: "Votre avis n'a pas pu être publié. Réessayez dans un instant." },
      { status: 500 }
    );
  }

  return Response.json({
    review: rowToReview(data as ReviewRow, params.driverId),
  });
}
