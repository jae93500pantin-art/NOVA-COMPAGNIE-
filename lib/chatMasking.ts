/**
 * Masquage des coordonnées dans un message de course (anti-désintermédiation).
 *
 * Module **pur** : la même fonction sert à l'aperçu côté navigateur, au
 * serveur qui écrit le message, et se rejoue dans le trigger SQL
 * (`mask_contact_details`, bloc 9 du schéma). Trois implémentations d'une même
 * règle divergeraient ; c'est la version TypeScript qui fait foi pour ce qui
 * est diffusé, le trigger SQL étant le filet pour tout ce qui entrerait par
 * une autre porte.
 *
 * ## Où le masquage doit avoir lieu
 *
 * ⚠️ **Avant la diffusion, pas seulement avant l'insertion.** Le piège d'un
 * masquage posé uniquement en trigger `BEFORE INSERT` : la copie persistée est
 * propre, mais le destinataire a déjà reçu le numéro en clair par le flux
 * temps réel — la règle ne protège alors plus rien, elle donne seulement
 * l'impression de le faire. D'où l'appel dans `buildMessage()`, passage
 * obligé du broker comme de la base.
 *
 * ## Ce que ça n'attrape pas, volontairement
 *
 * Les chiffres écrits en toutes lettres (« zéro six douze… »), les pseudos de
 * réseaux sociaux et les liens de messagerie tierce passent. Élargir demande
 * un arbitrage qu'un module pur ne peut pas rendre : « rejoignez-moi au 12 »
 * est une adresse, pas un contact. Le parti pris est de **ne jamais masquer un
 * faux positif** — un prix, une date, une heure, un numéro de vol, une adresse
 * — quitte à laisser passer une tentative contournée : un message mutilé au
 * milieu d'une course est un incident immédiat, alors qu'un numéro qui fuit
 * est un risque commercial différé.
 */

export const CONTACT_MASK = "***";

/**
 * Adresse e-mail. Les formes obfusquées entre parenthèses ou crochets
 * (`nom (at) domaine.fr`) sont couvertes ; le « at » nu ne l'est pas, il
 * confondrait « rendez-vous at 14h ».
 */
const EMAIL_RE =
  /[A-Za-z0-9._%+-]+\s*(?:@|\(\s*at\s*\)|\[\s*at\s*\])\s*[A-Za-z0-9.-]+\s*(?:\.|\(\s*dot\s*\)|\[\s*dot\s*\])\s*[A-Za-z]{2,}/gi;

/**
 * Numéro de téléphone : 9 à 14 chiffres derrière un indicatif (`+33`, `0033`)
 * ou un zéro initial. Séparateurs admis : espace, espace insécable, point,
 * tiret, parenthèses.
 *
 * ⚠️ Le `/` en est **exclu** : avec lui, « le 12/09/2026 14h » compte dix
 * chiffres et se ferait masquer. Une date est ce qu'on écrit le plus souvent
 * dans une conversation de course.
 *
 * ⚠️ Jusqu'à **deux** séparateurs entre deux chiffres, pour la notation
 * française « +33 (0)6 12 34 56 78 » : avec un seul, la parenthèse coupait le
 * numéro en deux et l'on affichait « +33 (*** » — un demi-masquage, c'est-à-dire
 * aucun.
 *
 * ⚠️ Pas de lookbehind (`(?<!…)`) : Safari ne l'a admis qu'en 16.4 et le
 * refuse **à l'analyse**, ce qui casserait le bundle entier sur un iPhone un
 * peu ancien. La borne gauche passe donc par un groupe capturé réinjecté.
 */
const PHONE_RE =
  /(^|[^\d+])(\(?(?:\+\d{1,3}|00\d{1,3}|0)(?:[ .() -]{0,2}\d){8,13})(?!\d)/g;

export interface MaskResult {
  text: string;
  /** Au moins une coordonnée a été retirée — sert à prévenir l'expéditeur. */
  masked: boolean;
}

/** Retire les coordonnées d'un texte libre. Idempotent. */
export function maskContacts(input: string): MaskResult {
  const text = input
    .replace(EMAIL_RE, CONTACT_MASK)
    .replace(PHONE_RE, (_m, before: string) => `${before}${CONTACT_MASK}`);
  return { text, masked: text !== input };
}

/** Le texte contient-il une coordonnée ? (aperçu avant envoi) */
export function hasContactDetails(input: string): boolean {
  return maskContacts(input).masked;
}
