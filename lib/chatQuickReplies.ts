/**
 * Réponses rapides de la messagerie de course.
 *
 * ## Pourquoi ce module existe (ce n'est pas une commodité d'interface)
 *
 * Un chauffeur qui tape « je suis sur place » au volant lit son écran pendant
 * plusieurs secondes. Les quatre messages qu'il envoie réellement sont
 * toujours les mêmes ; les proposer en un geste supprime la saisie au lieu de
 * l'accélérer. C'est une mesure de sécurité routière avant d'être un confort,
 * d'où des libellés courts, un jeu **fermé** — on ne compose pas une phrase à
 * partir d'eux — et des cibles tactiles larges côté interface.
 *
 * Les libellés passent par le dictionnaire (`chat.quick.*`) : le texte envoyé
 * est celui de la langue de l'expéditeur, comme s'il l'avait tapé.
 */

import type { ChatRole } from "./chat";

export interface QuickReply {
  /** Identifiant stable, indépendant de la langue. */
  id: string;
  /** Clé i18n du libellé, qui est aussi le texte envoyé. */
  key: string;
}

/** Ce qu'un chauffeur a besoin de dire, dans l'ordre du déroulé d'une course. */
export const DRIVER_QUICK_REPLIES: QuickReply[] = [
  { id: "onMyWay", key: "chat.quick.onMyWay" },
  { id: "arrived", key: "chat.quick.arrived" },
  { id: "late5", key: "chat.quick.late5" },
  { id: "whereAreYou", key: "chat.quick.whereAreYou" },
];

/** Ce qu'un client a besoin de dire, au même moment. */
export const CLIENT_QUICK_REPLIES: QuickReply[] = [
  { id: "comingDown", key: "chat.quick.comingDown" },
  { id: "exitA", key: "chat.quick.exitA" },
  { id: "lookingForCar", key: "chat.quick.lookingForCar" },
];

export function quickRepliesFor(role: ChatRole): QuickReply[] {
  return role === "driver" ? DRIVER_QUICK_REPLIES : CLIENT_QUICK_REPLIES;
}

/**
 * Un identifiant reçu correspond-il à une réponse rapide connue ?
 *
 * ⚠️ Le serveur ne fait **pas** confiance au drapeau `isQuickReply` envoyé par
 * le navigateur pour composer le texte : le texte reste le texte reçu. Ce
 * drapeau n'est qu'une statistique d'usage, il n'autorise rien — sans quoi un
 * appelant pourrait faire passer n'importe quel contenu pour un libellé de la
 * plateforme.
 */
export function isKnownQuickReply(id: string): boolean {
  return [...DRIVER_QUICK_REPLIES, ...CLIENT_QUICK_REPLIES].some(
    (q) => q.id === id
  );
}
