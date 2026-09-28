/**
 * Les tarifs annoncés par les chauffeurs. Module pur, testé.
 *
 * ## ⚠️ Chaque chauffeur fixe SES tarifs, et la plateforme ne touche pas l'argent
 *
 * Statut d'annuaire. Deux choses ont disparu d'ici, et ne doivent pas revenir :
 *
 * 1. **Les bandes par gamme.** Les classes standard étaient figées à 120 €/h et
 *    1 000 €/j (champ en lecture seule), les premium encadrées entre 150–250 €
 *    et 1 500–3 000 €. Imposer un prix commun ferait de Nova celle qui vend la
 *    course. `RATE_LIMITS` ne dit pas ce qu'une course vaut : il refuse une
 *    saisie absurde, et rien de plus.
 * 2. **Le barème de la plateforme** : commission de 15 % prélevée au chauffeur,
 *    frais de gestion de 5 % ajoutés au client, `priceBreakdown` et ses six
 *    montants. La plateforme n'encaisse plus rien par course, donc elle n'a
 *    plus rien à décomposer. Le tarif affiché est celui du chauffeur, sans
 *    ajout ni retenue — c'est lui qui facture son client.
 *
 * Un tarif reste un **prix TTC**, tel que le chauffeur le saisit.
 */

/**
 * Arrondi au centime. Les tarifs sont saisis à l'euro, mais rien n'interdit un
 * import ou une saisie au centime, et un affichage doit rester stable.
 */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export type RateUnit = "hour" | "day";

/**
 * Garde-fous de saisie, **identiques pour tout le monde**. Ce ne sont pas des
 * tarifs conseillés : un annuaire n'a pas d'avis sur le prix d'une course. Ils
 * n'existent que pour arrêter une faute de frappe (un zéro de trop) avant
 * qu'elle ne s'affiche publiquement.
 *
 * ⚠️ Les plafonds recopient les `check` de `public.drivers`
 * (`price_per_hour <= 1000`, `price_per_day <= 10000`). Les élargir ici sans
 * toucher au SQL ferait passer la validation côté formulaire puis **échouer
 * l'insertion** en base, ce qui se lit comme une panne, pas comme un refus.
 */
export const RATE_LIMITS: Record<RateUnit, { min: number; max: number }> = {
  hour: { min: 1, max: 1000 },
  day: { min: 1, max: 10000 },
};

/** Bornes de saisie d'une unité. Ne dépend **plus** de la gamme du véhicule. */
export function boundsFor(unit: RateUnit): { min: number; max: number } {
  return RATE_LIMITS[unit];
}

/** Le tarif saisi est-il exploitable ? (0 ou absent = non communiqué) */
export function isRateAcceptable(unit: RateUnit, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  const { min, max } = boundsFor(unit);
  return value >= min && value <= max;
}

/**
 * Ramène un tarif dans les garde-fous, côté serveur.
 *
 * ⚠️ **Il n'invente jamais un prix.** Un tarif absent, nul ou illisible rend
 * **0**, qui se lit « non communiqué » — pas le bas d'une bande. L'ancienne
 * version remontait un 0 à 120 €/h : un chauffeur validé sans avoir rempli son
 * dossier était donc publié à un tarif que personne n'avait choisi, et qu'un
 * client pouvait réserver. Inventer un prix à la place d'un professionnel est
 * exactement ce qu'un annuaire ne fait pas.
 */
export function clampRate(unit: RateUnit, value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(boundsFor(unit).max, Math.round(value));
}

/** French error message for the profile form, or null when the rate is fine. */
export function rateError(unit: RateUnit, value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return "Indiquez un tarif.";
  const { min, max } = boundsFor(unit);
  if (value < min || value > max) {
    const what = unit === "day" ? "journalier" : "horaire";
    return `Tarif ${what} attendu entre ${min} € et ${max} € TTC.`;
  }
  return null;
}
