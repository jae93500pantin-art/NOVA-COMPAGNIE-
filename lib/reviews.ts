/**
 * Avis déposés par les clients sur une fiche chauffeur.
 *
 * Module **pur** : les mêmes règles tournent dans le formulaire (erreurs
 * immédiates) et dans la route (le vrai contrôle), pour que le navigateur ne
 * puisse jamais être plus permissif que le serveur.
 *
 * ## ⚠️ Ces avis NE SONT PAS vérifiés, et le site doit le dire
 *
 * Une version antérieure de ce dépôt portait des « avis certifiés » : un avis
 * n'existait que rattaché à une **course terminée**, ce qui prouvait que son
 * auteur avait réellement été transporté. La réservation a été retirée
 * (statut d'annuaire) — donc **cette preuve n'existe plus**. Nova ne sait pas,
 * et ne peut pas savoir, si une course a eu lieu : elle ne l'organise pas, ne
 * l'encaisse pas et ne la facture pas.
 *
 * Trois conséquences, qui ne sont pas des détails de présentation :
 *
 * 1. **Le mot « certifié » / « vérifié » est interdit sur un avis.** Il l'a été
 *    quand la preuve existait ; l'employer aujourd'hui serait une allégation
 *    fausse sur la fiche d'un professionnel réel.
 * 2. **L'affichage doit porter la mention** `REVIEW_DISCLOSURE` : publier des
 *    avis de consommateurs oblige à indiquer s'ils sont vérifiés et comment
 *    (art. L111-7-2 du Code de la consommation, directive Omnibus). Ne pas rien
 *    dire est précisément l'infraction.
 * 3. **Un compte est exigé pour écrire**, et c'est le seul garde-fou qui reste :
 *    il n'empêche pas un faux avis, il le rend traçable et limite le dépôt en
 *    masse. ⚠️ Ne pas le présenter comme une vérification.
 *
 * Le jour où une preuve de prestation existe (facture du chauffeur déposée,
 * confirmation de sa part), elle se branche ici — et c'est à ce moment-là, et
 * pas avant, qu'un avis peut se dire vérifié.
 */

/** La mention obligatoire, à afficher partout où des avis sont listés. */
export const REVIEW_DISCLOSURE =
  "Avis publiés par des titulaires d'un compte Nova Compagnie. Nova n'organise pas les courses et ne peut donc pas vérifier qu'une prestation a eu lieu : ces avis ne sont pas vérifiés.";

export const RATING_MIN = 1;
export const RATING_MAX = 5;
export const COMMENT_MIN = 10;
/** ⚠️ Recopie le `check` de `public.reviews` : élargir ici seulement ferait
 *  passer le formulaire puis **échouer l'insertion**, ce qui se lit comme une
 *  panne et non comme un refus. */
export const COMMENT_MAX = 500;

export interface Review {
  id: string;
  driverId: string;
  authorId: string | null;
  authorName: string;
  rating: number;
  comment: string;
  createdAt: string;
  /** Renseigné seulement si l'avis a été modifié après coup. */
  updatedAt?: string | null;
}

export interface ReviewDraft {
  rating: number;
  comment: string;
}

/** Les motifs de refus, en clés : la route et le formulaire parlent la même langue. */
export type ReviewError =
  | "rating"
  | "commentShort"
  | "commentLong"
  | "notSignedIn"
  | "notClient"
  | "duplicate";

export const REVIEW_ERRORS: Record<ReviewError, string> = {
  rating: "Choisissez une note de 1 à 5 étoiles.",
  commentShort: `Votre avis doit faire au moins ${COMMENT_MIN} caractères.`,
  commentLong: `Votre avis ne peut pas dépasser ${COMMENT_MAX} caractères.`,
  notSignedIn: "Connectez-vous pour évaluer ce chauffeur.",
  notClient:
    "Seul un compte client peut déposer un avis. Un chauffeur ne peut pas évaluer un confrère.",
  duplicate: "Vous avez déjà publié un avis sur ce chauffeur.",
};

/**
 * Le contenu est-il acceptable ? `null` = oui.
 *
 * ⚠️ Ne dit **rien** de l'autorisation : c'est `reviewAuthorError` qui s'en
 * charge. Les deux sont séparés parce que le formulaire peut valider le texte
 * en direct alors que l'identité n'est connue que du serveur.
 */
export function reviewContentError(draft: ReviewDraft): ReviewError | null {
  if (
    !Number.isInteger(draft.rating) ||
    draft.rating < RATING_MIN ||
    draft.rating > RATING_MAX
  ) {
    return "rating";
  }
  const comment = draft.comment.trim();
  if (comment.length < COMMENT_MIN) return "commentShort";
  if (comment.length > COMMENT_MAX) return "commentLong";
  return null;
}

/**
 * L'auteur a-t-il le droit d'écrire ? `null` = oui.
 *
 * ⚠️ `role` doit venir de **`profiles`**, jamais de `user_metadata` : un
 * utilisateur peut réécrire ses propres métadonnées avec
 * `supabase.auth.updateUser({ data: { role: "client" } })`, alors que la
 * colonne est verrouillée par le trigger `profiles_protect_privileged`.
 */
export function reviewAuthorError(author: {
  signedIn: boolean;
  role?: string | null;
  alreadyReviewed?: boolean;
}): ReviewError | null {
  if (!author.signedIn) return "notSignedIn";
  // ⚠️ `admin` est refusé comme `driver` : un avis signé par la plateforme
  // elle-même sur un professionnel qu'elle référence n'est pas un avis client.
  if (author.role !== "client") return "notClient";
  if (author.alreadyReviewed) return "duplicate";
  return null;
}

/**
 * Moyenne et répartition, calculées **sur les avis réellement présents**.
 *
 * ⚠️ `drivers.rating` vaut **5.0 par défaut** en base et `reviews_count` 0 :
 * lire ces colonnes publierait « 5,0 ★ · 0 avis » sur chaque fiche neuve,
 * c'est-à-dire une note inventée sur un professionnel réel. D'où le calcul
 * ici, et `null` quand il n'y a rien à moyenner — **pas 0**, qui s'afficherait
 * comme la plus mauvaise note possible.
 */
export function ratingSummary(reviews: Review[]): {
  average: number | null;
  count: number;
  distribution: Record<number, number>;
} {
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of reviews) {
    if (r.rating >= RATING_MIN && r.rating <= RATING_MAX) {
      distribution[Math.round(r.rating)] += 1;
    }
  }
  if (reviews.length === 0) {
    return { average: null, count: 0, distribution };
  }
  const total = reviews.reduce((sum, r) => sum + r.rating, 0);
  return {
    average: Math.round((total / reviews.length) * 10) / 10,
    count: reviews.length,
    distribution,
  };
}

/**
 * Le nom affiché sous un avis.
 *
 * ⚠️ Prénom + initiale du nom, jamais le nom complet : l'auteur d'un avis est
 * un particulier, et sa signature est publique et indexable. ⚠️ Et jamais son
 * e-mail, même tronqué. Un auteur dont le compte a été supprimé devient
 * « Client Nova » plutôt que de disparaître — retirer l'avis réécrirait la
 * moyenne d'un chauffeur à chaque suppression de compte.
 */
export function reviewSignature(
  firstName?: string | null,
  lastName?: string | null
): string {
  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();
  if (!first) return "Client Nova";
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
}

/**
 * Cet avis appartient-il à cette personne ?
 *
 * ⚠️ **La seule règle de modification et de suppression**, et elle tient en une
 * ligne : son auteur, personne d'autre. Pas de fenêtre de temps, pas de
 * modération implicite.
 *
 * ⚠️ `authorId` null (compte supprimé) rend **false** : l'avis devient
 * immodifiable plutôt que modifiable par n'importe qui. Sans ce cas, un
 * `null === undefined` mal placé rendrait orphelin et public le droit
 * d'écriture sur ces avis.
 */
export function canModifyReview(
  review: Pick<Review, "authorId">,
  userId: string | null | undefined
): boolean {
  if (!review.authorId || !userId) return false;
  return review.authorId === userId;
}

/**
 * Un avis modifié doit le DIRE.
 *
 * ⚠️ Sans cette mention, un auteur peut remplacer « chauffeur parfait » par
 * « expérience catastrophique » sans que rien ne l'indique : le lecteur croit
 * lire l'impression d'origine, et le chauffeur ne peut pas montrer que le texte
 * a changé. L'horodatage de création reste affiché à côté.
 */
export function wasEdited(review: Pick<Review, "createdAt" | "updatedAt">): boolean {
  if (!review.updatedAt) return false;
  const created = new Date(review.createdAt).getTime();
  const updated = new Date(review.updatedAt).getTime();
  if (!Number.isFinite(created) || !Number.isFinite(updated)) return false;
  // ⚠️ Une seconde de tolérance : `updated_at` est posé par défaut à la même
  // valeur que `created_at` à l'insertion, et deux `now()` dans la même
  // transaction peuvent différer de quelques microsecondes. Sans marge, tout
  // avis neuf s'afficherait « modifié ».
  return updated - created > 1000;
}
