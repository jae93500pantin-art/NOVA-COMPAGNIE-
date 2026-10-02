import { NextRequest } from "next/server";
import { getServerUser } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/config";
import { rateLimit, sanitizeText } from "@/lib/validation";
import { getDirectoryDriverAccountId } from "@/lib/driverDirectory";
import {
  COMMENT_MAX,
  REVIEW_ERRORS,
  canModifyReview,
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
  updated_at?: string | null;
}

/** Les colonnes rendues au navigateur. ⚠️ Jamais `booking_id` : il désignerait
 *  une réservation d'avant le statut d'annuaire, dont rien ne doit dépendre. */
const SELECT = "id, author_id, author_name, rating, comment, created_at, updated_at";

/**
 * Le même select, sans `updated_at`.
 *
 * ⚠️ Cette colonne arrive avec la migration du 2026-10-02, qui peut n'être pas
 * encore appliquée. PostgREST répond alors `42703` et **toute la liste des avis
 * disparaît** — une section vide sur une fiche, sans erreur visible, pour une
 * colonne d'affichage secondaire. On réessaie donc sans elle.
 */
const SELECT_LEGACY = "id, author_id, author_name, rating, comment, created_at";

/**
 * La colonne manque-t-elle en base ? (et non : une autre erreur SQL)
 *
 * ⚠️ **DEUX codes, selon l'endroit où la colonne est nommée** — vérifié en
 * conditions réelles sur ce projet :
 *
 * | Où | Code | Message |
 * |---|---|---|
 * | dans le `select` | `42703` | « column reviews.updated_at does not exist » (Postgres) |
 * | dans le CORPS d'un insert/update | `PGRST204` | « Could not find the 'updated_at' column … in the schema cache » (PostgREST) |
 *
 * Ne tester que `42703` laisse donc passer exactement le cas de l'écriture :
 * la lecture se repliait correctement, et `PATCH` répondait 500.
 */
function isMissingColumn(err: { code?: string } | null | undefined): boolean {
  return err?.code === "42703" || err?.code === "PGRST204";
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
    updatedAt: row.updated_at ?? null,
  };
}

/**
 * L'avis de cette personne sur ce chauffeur, ou `null`.
 *
 * ⚠️ On retrouve l'avis par **l'auteur**, jamais par un id envoyé par le
 * navigateur. Un `reviewId` dans le corps de la requête devrait de toute façon
 * être revérifié contre son propriétaire — autant ne jamais le lire : il n'y a
 * qu'un avis par auteur et par chauffeur, donc rien à désigner.
 */
async function ownReview(
  client: NonNullable<ReturnType<typeof db>>,
  driverUuid: string,
  authorId: string
) {
  const one = (columns: string) =>
    client
      .from("reviews")
      .select(columns)
      .eq("driver_id", driverUuid)
      .eq("author_id", authorId)
      .maybeSingle();

  let { data, error } = await one(SELECT);
  if (isMissingColumn(error)) ({ data, error } = await one(SELECT_LEGACY));
  return (data as unknown as ReviewRow | null) ?? null;
}

/**
 * Le socle commun à `PATCH` et `DELETE` : cadence, session, chauffeur
 * publiable, et l'avis dont on est l'auteur.
 *
 * ⚠️ L'ordre compte. La session **avant** la résolution du chauffeur, et un
 * avis absent répond **404 comme un slug inconnu** : distinguer les deux dirait
 * à un tiers qu'un avis existe sur ce chauffeur, et de qui.
 */
async function guardOwner(req: NextRequest, slug: string) {
  if (!rateLimit(`review-edit:${ipOf(req)}`, 10, 60_000).ok) {
    return { error: Response.json({ error: "Trop de tentatives" }, { status: 429 }) };
  }
  const client = db();
  if (!client) {
    return {
      error: Response.json(
        { error: "Modification indisponible : la base n'est pas configurée." },
        { status: 503 }
      ),
    };
  }
  const session = await getServerUser();
  if (session.state !== "ok") {
    return {
      error: Response.json({ error: REVIEW_ERRORS.notSignedIn }, { status: 401 }),
    };
  }
  const driverUuid = await getDirectoryDriverAccountId(slug);
  if (!driverUuid) {
    return { error: Response.json({ error: "Chauffeur introuvable" }, { status: 404 }) };
  }
  const row = await ownReview(client, driverUuid, session.user.id);
  // ⚠️ `canModifyReview` est rejoué sur la ligne lue, même si la requête l'a
  // déjà filtrée sur `author_id` : c'est la règle, et elle doit tenir si la
  // requête change un jour.
  if (!row || !canModifyReview({ authorId: row.author_id }, session.user.id)) {
    return { error: Response.json({ error: "Avis introuvable" }, { status: 404 }) };
  }
  return { client, session, driverUuid, row };
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

  const list = (columns: string) =>
    client
      .from("reviews")
      .select(columns)
      .eq("driver_id", driverUuid)
      .order("created_at", { ascending: false })
      .limit(200);

  let { data, error } = await list(SELECT);
  // ⚠️ Un seul réessai, et seulement sur « colonne inconnue » : relancer sur
  // n'importe quelle erreur doublerait la charge d'une base déjà en difficulté.
  if (isMissingColumn(error)) ({ data, error } = await list(SELECT_LEGACY));

  if (error) {
    console.error(`[reviews] lecture refusée : ${error.message}`);
    return Response.json({ reviews: [] });
  }

  return Response.json({
    reviews: (data as unknown as ReviewRow[]).map((r) =>
      rowToReview(r, params.driverId)
    ),
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

  const publish = (columns: string) =>
    client
      .from("reviews")
      .insert({
        driver_id: driverUuid,
        author_id: session.user.id,
        author_name: authorName,
        rating: draft.rating,
        comment: draft.comment.trim(),
      })
      .select(columns)
      .maybeSingle();

  let { data, error } = await publish(SELECT);
  /**
   * ⚠️ `updated_at` ne figure pas dans les valeurs insérées — c'est le
   * `.select()` de RETOUR qui le demande. Avant la migration du 2026-10-02 la
   * colonne n'existe pas, et la publication répondait 500 : le visiteur perdait
   * son texte à cause d'une colonne qui ne sert qu'à afficher « modifié ».
   *
   * Le réessai est sûr : PostgREST émet un seul `insert … returning`, donc une
   * colonne inconnue fait échouer l'instruction **entière** et rien n'est
   * écrit. Vérifié en conditions réelles — la liste restait vide après le 500.
   */
  if (isMissingColumn(error)) ({ data, error } = await publish(SELECT_LEGACY));

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
    review: rowToReview(data as unknown as ReviewRow, params.driverId),
  });
}

/**
 * Modifier SON avis.
 *
 * ⚠️ Le contenu repasse par `reviewContentError` : c'est précisément ce qu'une
 * policy RLS d'`update` ne saurait pas faire. Postgres ne restreint pas un
 * UPDATE à certaines colonnes dans une policy, donc un auteur muni de son
 * jeton pourrait, par PostgREST, réécrire `author_name`, `driver_id` ou
 * `created_at` — et poser un commentaire d'un caractère. Ici, seuls `rating`,
 * `comment` et `updated_at` sont écrits.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { driverId: string } }
) {
  const g = await guardOwner(req, params.driverId);
  if ("error" in g) return g.error;

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
  const invalid = reviewContentError(draft);
  if (invalid) {
    return Response.json({ error: REVIEW_ERRORS[invalid] }, { status: 400 });
  }

  const save = (withTimestamp: boolean) =>
    g.client
      .from("reviews")
      .update({
        rating: draft.rating,
        comment: draft.comment.trim(),
        // ⚠️ Posé explicitement : le `default now()` ne s'applique qu'à
        // l'insertion, donc sans cette ligne un avis modifié garderait sa date
        // d'origine et la mention « modifié » n'apparaîtrait jamais.
        ...(withTimestamp ? { updated_at: new Date().toISOString() } : {}),
      })
      .eq("id", g.row.id)
      // ⚠️ Deuxième filtre sur l'auteur, dans la requête d'écriture elle-même :
      // `g.row` vient d'une lecture antérieure, et une seule condition `id`
      // ferait reposer toute la sécurité sur le fait que cette lecture ait bien
      // eu lieu.
      .eq("author_id", g.session.user.id)
      .select(withTimestamp ? SELECT : SELECT_LEGACY)
      .maybeSingle();

  let { data, error } = await save(true);
  /**
   * ⚠️ Avant la migration du 2026-10-02, `updated_at` n'existe pas. Sans ce
   * repli, « Modifier » répondrait 500 : le visiteur perdrait son texte pour
   * une colonne qui ne sert qu'à afficher « modifié ». On enregistre donc la
   * correction, sans la mention — l'essentiel passe, l'accessoire attend.
   */
  if (isMissingColumn(error)) ({ data, error } = await save(false));

  if (error || !data) {
    console.error(`[reviews] modification refusée : ${error?.message}`);
    return Response.json(
      { error: "Votre avis n'a pas pu être modifié. Réessayez dans un instant." },
      { status: 500 }
    );
  }

  return Response.json({
    review: rowToReview(data as unknown as ReviewRow, params.driverId),
  });
}

/**
 * Supprimer SON avis.
 *
 * ⚠️ Suppression réelle, pas un drapeau « masqué ». Un avis conservé mais
 * invisible reste une donnée personnelle de son auteur, qui vient précisément
 * de demander son retrait — et la moyenne devrait alors l'exclure partout, ce
 * que personne ne vérifie jamais sur tous les chemins de lecture.
 *
 * ⚠️ `refresh_driver_rating()` recalcule `drivers.rating` sur la suppression
 * comme sur l'insertion : la fiche ne garde pas la note d'un avis effacé.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { driverId: string } }
) {
  const g = await guardOwner(req, params.driverId);
  if ("error" in g) return g.error;

  const { error } = await g.client
    .from("reviews")
    .delete()
    .eq("id", g.row.id)
    .eq("author_id", g.session.user.id);

  if (error) {
    console.error(`[reviews] suppression refusée : ${error.message}`);
    return Response.json(
      { error: "Votre avis n'a pas pu être supprimé. Réessayez." },
      { status: 500 }
    );
  }

  return Response.json({ ok: true });
}
