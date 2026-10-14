/**
 * Règles du formulaire `/contact`, partagées par le formulaire et la route
 * `POST /api/contact` (pur, testé).
 *
 * Le message est **enregistré** dans `contact_messages` (migration du
 * 2026-10-14), puis notifié par e-mail à `CONTACT_EMAIL`. La route ne
 * répond un succès que si l'un des deux a réussi — jamais un succès simulé,
 * le défaut de l'ancien formulaire, qui affichait « Message bien reçu » et
 * perdait tout.
 */

/**
 * ⚠️ Plus de type « Réservation » (2026-10-14) : le site ne prend aucune
 * réservation (statut d'annuaire, règle 1), et proposer ce motif invitait à
 * en demander une. Un ancien message en base peut encore porter
 * `typeReservation` : `type` est un `text`, rien ne casse.
 */
export const CONTACT_TYPES = [
  "typeGeneral",
  "typeTransfer",
  "typeDriver",
  "typePartnership",
  "typeSupport",
  "typeOther",
] as const;

export type ContactType = (typeof CONTACT_TYPES)[number];

/** Libellés de l'e-mail interne (en français : il part vers l'équipe). */
export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  typeGeneral: "Demande d'information",
  typeTransfer: "Transfert aéroport",
  typeDriver: "Devenir chauffeur",
  typePartnership: "Partenariat",
  typeSupport: "Support",
  typeOther: "Autre",
};

/**
 * Durée de conservation d'un message de contact, en mois. Même raisonnement
 * que `QUOTE_RETENTION_MONTHS` : nom, e-mail et téléphone d'un particulier
 * sans compte. ⚠️ Annoncée sur `/legal/confidentialite` depuis cette
 * constante, et appliquée par la purge de la console.
 */
export const CONTACT_RETENTION_MONTHS = 12;

/** Instant avant lequel un message a dépassé sa durée de conservation. */
export function contactRetentionCutoff(now: Date = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - CONTACT_RETENTION_MONTHS);
  return cutoff;
}

export const CONTACT_LIMITS = {
  firstName: 60,
  lastName: 60,
  email: 160,
  phone: 30,
  message: 4000,
} as const;

export interface ContactDraft {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  type: string;
  message: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isContactType(v: string): v is ContactType {
  return (CONTACT_TYPES as readonly string[]).includes(v);
}

/** Clé i18n de la première erreur, ou `null`. */
export function contactError(d: ContactDraft): "contact.errorRequired" | "contact.errorEmail" | null {
  if (
    !d.firstName.trim() ||
    !d.lastName.trim() ||
    !d.email.trim() ||
    !isContactType(d.type) ||
    !d.message.trim()
  ) {
    return "contact.errorRequired";
  }
  if (!EMAIL_RE.test(d.email.trim())) return "contact.errorEmail";
  return null;
}
