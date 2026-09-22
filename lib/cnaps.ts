/**
 * Carte professionnelle CNAPS : une **qualification du chauffeur**, jamais une
 * prestation de la plateforme.
 *
 * ## Pourquoi ce module ne parle plus de « prestation de sécurité »
 *
 * Nova Compagnie n'a pas d'autorisation d'exercer délivrée par le CNAPS.
 * L'article L612-2 du Code de la sécurité intérieure interdit d'exercer **et
 * de commercialiser** une activité de sécurité privée sans cette autorisation.
 * Or la plateforme encaisse la totalité du montant et édite la facture : dans
 * ce modèle, vendre un « transport avec protection » reviendrait à exercer
 * illégalement l'activité, quelle que soit la qualification du chauffeur qui
 * l'exécute.
 *
 * Ce qui reste donc autorisé, et ce que fait ce module : **qualifier un
 * profil**. Dire « ce chauffeur est titulaire d'une carte professionnelle
 * CNAPS, que nous avons vérifiée » décrit une personne, exactement comme
 * « 12 ans d'expérience » ou « parle anglais ». Ce que la plateforme vend
 * reste une course VTC, facturée comme telle.
 *
 * ## Les trois choses à ne pas refaire
 *
 * ⚠️ **Ne pas réintroduire un axe de prestation.** Un sélecteur
 * « VTC | Protection » dans la recherche, une section d'accueil qui vend la
 * protection rapprochée, un forfait « sécurité » : tout cela commercialise
 * l'activité. Ça a existé dans ce dépôt, et ça a été retiré pour cette raison.
 *
 * ⚠️ **Ne jamais faire dire au badge que Nova habilite qui que ce soit.**
 * Le CNAPS délivre la carte ; la plateforme constate seulement qu'elle existe
 * et qu'elle est valide. D'où « Carte professionnelle CNAPS vérifiée » et non
 * « Certifié Nova » ou « Agent de protection agréé ».
 *
 * ⚠️ **Ne jamais dériver un droit de réserver de cette valeur.** Elle
 * n'ouvre aucun filtre, aucun tarif, aucune ligne de facture. Le jour où la
 * société obtiendrait l'autorisation d'exercer (ou sous-traiterait à une
 * société agréée), ce serait une décision produit **et** juridique, pas un
 * booléen de plus à lire ici.
 */

/** Type de pièce justificative portant la carte (voir `driverDocuments`). */
export const CNAPS_DOCUMENT_KIND = "cnaps_card" as const;

/**
 * Le badge peut-il être affiché ?
 *
 * ⚠️ `cnapsVerified` est posé par l'administration après examen de la pièce,
 * jamais par le chauffeur (trigger `drivers_protect_cnaps`, et la valeur est
 * recalculée depuis le statut du document par `refresh_cnaps_verified`).
 * Afficher le badge sur simple déclaration reviendrait à publier une
 * habilitation que personne n'a vérifiée.
 */
export function hasVerifiedCnapsCard(driver: {
  cnapsVerified?: boolean;
}): boolean {
  return driver.cnapsVerified === true;
}

/** État de la carte, du point de vue du chauffeur dans son espace. */
export type CnapsCardState = "missing" | "pending" | "verified" | "rejected";

/**
 * Traduit le statut de la pièce déposée.
 *
 * Sert **au chauffeur** pour suivre son dossier — pas au client, qui ne voit
 * que deux cas : le badge, ou rien. Une carte en attente d'examen n'apparaît
 * nulle part côté public.
 */
export function cnapsCardState(
  document?: { status?: string | null } | null
): CnapsCardState {
  if (!document) return "missing";
  if (document.status === "approved") return "verified";
  if (document.status === "rejected") return "rejected";
  return "pending";
}
