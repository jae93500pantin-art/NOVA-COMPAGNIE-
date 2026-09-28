/**
 * Driver pricing: per-category rate bands + the platform economics.
 * Pure and unit-tested — the same rules run in the profile form and on the
 * server, so a rate can never be stored outside its band.
 *
 * ## Le barème (deux prélèvements distincts, sur deux bases distinctes)
 *
 * Le **prix chauffeur** (`pricePerHour` × heures, `pricePerDay` × jours, ou le
 * forfait de transfert) est la base de tout le calcul. Ni le client ni le
 * chauffeur ne le paient ni ne l'encaissent tel quel :
 *
 * - le client règle ce prix **+ 5 % de frais de gestion** ;
 * - le chauffeur touche ce prix **− 15 % de commission**.
 *
 * ⚠️ Les deux taux ne s'additionnent pas en un « 20 % » : ils ne s'appliquent
 * pas au même montant et ne se lisent pas au même endroit. Les confondre
 * afficherait au client une commission qu'il ne paie pas, et au chauffeur des
 * frais qu'il ne supporte pas. La marge de la plateforme est leur **somme**
 * (`platformMargin`), jamais un troisième pourcentage.
 *
 * ⚠️ Un tarif affiché reste un **prix TTC** : c'est ce que le chauffeur saisit.
 *
 * ## ⚠️ Chaque chauffeur fixe SES tarifs — la plateforme n'en impose aucun
 *
 * Statut d'annuaire : imposer un prix commun ferait de Nova celle qui vend la
 * course. Il n'y a donc plus de bandes par gamme (les classes standard étaient
 * figées à 120 €/h et 1 000 €/j, les premium encadrées entre 150–250 € et
 * 1 500–3 000 €), plus de `PRICE_BANDS`, plus de champ en lecture seule.
 * `RATE_LIMITS` ne dit pas ce qu'une course vaut : il refuse une saisie
 * absurde, et rien de plus.
 */

/** Commission prélevée **sur** le prix du chauffeur (déduite de son revenu). */
export const PLATFORM_COMMISSION_RATE = 0.15;

/** Frais de gestion **ajoutés** au prix du chauffeur, à la charge du client. */
export const CLIENT_SERVICE_FEE_RATE = 0.05;

/**
 * Arrondi au centime. Tout l'argent de ce module y passe : arrondir à l'euro
 * ferait mentir une facture dès que 5 % tombe sur une demie (170 € → 8,50 €).
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

/**
 * La décomposition complète d'une course, les deux côtés du guichet.
 * Toutes les valeurs sont en euros, arrondies au centime.
 */
export interface PriceBreakdown {
  /** Le prix fixé par le chauffeur — la base de tout le reste. */
  driverPrice: number;
  /** Frais de gestion à la charge du client (5 %). */
  clientFee: number;
  /** Ce que le client règle : prix chauffeur + frais. */
  clientTotal: number;
  /** Commission prélevée au chauffeur (15 %). */
  commission: number;
  /** Ce que le chauffeur encaisse : prix chauffeur − commission. */
  driverNet: number;
  /** Ce que la plateforme garde : frais client + commission chauffeur. */
  platformMargin: number;
}

const EMPTY_BREAKDOWN: PriceBreakdown = {
  driverPrice: 0,
  clientFee: 0,
  clientTotal: 0,
  commission: 0,
  driverNet: 0,
  platformMargin: 0,
};

/**
 * Décompose un prix chauffeur en ce que paie le client et ce qu'encaisse le
 * chauffeur.
 *
 * Deux règles de dérivation, et elles ne sont pas décoratives :
 *
 * - `clientTotal` est obtenu par **addition** (`prix + frais`) et non en
 *   recalculant `prix × 1,05`. Les deux coïncident pour les tarifs entiers que
 *   produisent les bandes, mais sur un montant qui tombe mal ils peuvent
 *   diverger d'un centime — et une facture dont le total ne vaut pas la somme
 *   de ses lignes est une facture qu'on ne peut pas défendre.
 * - `driverNet` est obtenu par **soustraction**, pour la même raison :
 *   arrondir la commission et le net chacun de son côté, c'est finir à un
 *   centime près du compte.
 */
export function priceBreakdown(driverPrice: number): PriceBreakdown {
  if (!Number.isFinite(driverPrice) || driverPrice <= 0) {
    return { ...EMPTY_BREAKDOWN };
  }
  const base = round2(driverPrice);
  const clientFee = round2(base * CLIENT_SERVICE_FEE_RATE);
  const commission = round2(base * PLATFORM_COMMISSION_RATE);
  return {
    driverPrice: base,
    clientFee,
    clientTotal: round2(base + clientFee),
    commission,
    driverNet: round2(base - commission),
    platformMargin: round2(clientFee + commission),
  };
}

/**
 * Le chemin inverse : retrouver la décomposition depuis le total client.
 *
 * ⚠️ Une réservation ne stocke que son total client (`bookings.total`). Le
 * détail se **redérive** plutôt que d'être dupliqué en base : une colonne
 * figée au moment de la course prendrait le barème d'alors, et l'affichage
 * mentirait le jour où le taux bouge. Le prix chauffeur est reconstitué, puis
 * les frais par différence, pour que le total affiché reste **exactement**
 * celui qui a été facturé.
 */
export function breakdownFromClientTotal(clientTotal: number): PriceBreakdown {
  if (!Number.isFinite(clientTotal) || clientTotal <= 0) {
    return { ...EMPTY_BREAKDOWN };
  }
  const total = round2(clientTotal);
  const driverPrice = round2(total / (1 + CLIENT_SERVICE_FEE_RATE));
  const clientFee = round2(total - driverPrice);
  const commission = round2(driverPrice * PLATFORM_COMMISSION_RATE);
  return {
    driverPrice,
    clientFee,
    clientTotal: total,
    commission,
    driverNet: round2(driverPrice - commission),
    platformMargin: round2(clientFee + commission),
  };
}

/** Commission prélevée sur un prix chauffeur. */
export const commissionOn = (driverPrice: number): number =>
  priceBreakdown(driverPrice).commission;

/** Revenu net du chauffeur pour un prix chauffeur donné. */
export const driverNetOn = (driverPrice: number): number =>
  priceBreakdown(driverPrice).driverNet;

/** Total réglé par le client pour un prix chauffeur donné. */
export const clientTotalOn = (driverPrice: number): number =>
  priceBreakdown(driverPrice).clientTotal;
