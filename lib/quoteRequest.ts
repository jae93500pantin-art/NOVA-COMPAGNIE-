/**
 * Demande de devis adressée à un chauffeur référencé.
 *
 * Module **pur**, partagé par le formulaire et la route.
 *
 * ## ⚠️ Une demande de devis n'est PAS une réservation
 *
 * Le statut d'annuaire interdit de prendre une réservation et d'encaisser une
 * course. La frontière est précise, et ce module se tient du bon côté :
 *
 * | Ce que fait ce formulaire | Ce qu'il ne fait pas |
 * |---|---|
 * | transmet une demande au chauffeur | bloquer un créneau |
 * | laisse le visiteur décrire son trajet | calculer un prix |
 * | nomme le chauffeur choisi par le visiteur | choisir le chauffeur à sa place |
 * | annonce une mise en relation | confirmer une course |
 *
 * ⚠️ **Aucun montant n'est produit ici, ni côté serveur.** Un « devis » chiffré
 * par Nova serait un prix imposé au chauffeur (règle 3) et ferait de la
 * plateforme le vendeur de la prestation. Le devis est émis **par le
 * chauffeur**, qui facture son client ; Nova ne fait que porter la demande.
 *
 * ⚠️ **Aucun compte n'est exigé** : c'est le point de tout ceci. Demander à
 * s'inscrire pour obtenir un devis écarterait la majorité des visiteurs d'un
 * annuaire, dont le seul service est la mise en relation.
 */

/** Ce que le visiteur saisit. */
export interface QuoteDraft {
  name: string;
  email: string;
  phone: string;
  trip: string;
  /** Facultatif : le visiteur décrit ce qu'il veut, il n'est pas interrogé. */
  details?: string;
}

export type QuoteField = "name" | "email" | "phone" | "trip";

export const QUOTE_LIMITS = {
  name: 80,
  email: 254,
  phone: 30,
  trip: 200,
  details: 1000,
} as const;

/**
 * ⚠️ Volontairement permissif.
 *
 * Un visiteur qui veut un devis n'a aucune raison d'être recalé par un
 * validateur zélé : un numéro étranger, un indicatif entre parenthèses, un
 * point ou une barre de séparation sont tous légitimes. On vérifie qu'il y a
 * **assez de chiffres pour rappeler quelqu'un**, pas la conformité au plan de
 * numérotation français.
 */
const PHONE_DIGITS_MIN = 9;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const QUOTE_ERRORS: Record<QuoteField, string> = {
  name: "Indiquez votre nom.",
  email: "Indiquez une adresse e-mail valide.",
  phone: "Indiquez un numéro de téléphone (au moins 9 chiffres).",
  trip: "Décrivez le trajet souhaité (départ et destination).",
};

/** Le premier champ fautif, ou `null`. L'ordre suit celui du formulaire. */
export function quoteError(draft: QuoteDraft): QuoteField | null {
  if (draft.name.trim().length < 2) return "name";
  const email = draft.email.trim();
  if (!EMAIL_RE.test(email) || email.length > QUOTE_LIMITS.email) return "email";
  if (countDigits(draft.phone) < PHONE_DIGITS_MIN) return "phone";
  if (draft.trip.trim().length < 3) return "trip";
  return null;
}

function countDigits(value: string): number {
  let n = 0;
  for (const c of value) if (c >= "0" && c <= "9") n += 1;
  return n;
}

/**
 * Normalise la demande avant de l'enregistrer.
 *
 * ⚠️ Les champs sont **tronqués, pas refusés**, aux longueurs des colonnes :
 * perdre la demande d'un client parce qu'il a collé une adresse à rallonge
 * serait pire que de l'enregistrer raccourcie. Les bornes basses, elles, sont
 * refusées par `quoteError` — un champ trop court n'est pas exploitable.
 */
export function normalizeQuote(draft: QuoteDraft): Required<QuoteDraft> {
  return {
    name: draft.name.trim().slice(0, QUOTE_LIMITS.name),
    email: draft.email.trim().toLowerCase().slice(0, QUOTE_LIMITS.email),
    phone: draft.phone.trim().slice(0, QUOTE_LIMITS.phone),
    trip: draft.trip.trim().slice(0, QUOTE_LIMITS.trip),
    details: (draft.details ?? "").trim().slice(0, QUOTE_LIMITS.details),
  };
}
