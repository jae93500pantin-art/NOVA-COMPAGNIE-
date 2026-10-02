/**
 * Les coordonnées officielles de Nova Compagnie, en un seul endroit.
 *
 * ## ⚠️ Pourquoi ce module existe
 *
 * L'adresse de contact était recopiée en clair dans trois fichiers (le
 * formulaire de contact, la politique de confidentialité, les mentions
 * légales) et le numéro dans deux autres. Une coordonnée recopiée est une
 * coordonnée qui finit par n'être changée qu'à moitié — et sur une page
 * légale, une adresse à laquelle plus personne ne répond n'est pas un détail
 * d'affichage : la politique de confidentialité **est** le canal d'exercice
 * des droits RGPD, et les mentions légales doivent permettre de joindre
 * l'éditeur.
 *
 * Tout changement de coordonnée se fait donc ici, et nulle part ailleurs.
 */

/** L'adresse de contact, pour tout : support, RGPD, mentions légales. */
export const CONTACT_EMAIL = "ContactFrance@novacompagnie.com";

/**
 * Le numéro, en chiffres seuls au format international.
 *
 * ⚠️ Sans `+`, sans espace et sans le `0` national : c'est le format qu'exige
 * `wa.me`, qui ne redresse rien et ouvre une conversation vide si le numéro
 * ne lui plaît pas.
 */
export const CONTACT_PHONE_DIGITS = "33744783457";

/** Le numéro tel qu'on l'écrit en France. */
export const CONTACT_PHONE_DISPLAY = "07 44 78 34 57";

/**
 * ⚠️ **Il n'y a volontairement PAS de lien `tel:`.**
 *
 * Ce numéro est une ligne **WhatsApp**, pas un standard téléphonique. Un lien
 * d'appel lancerait une sonnerie que personne ne décroche : le visiteur en
 * conclut que la société ne répond pas, alors qu'il lui suffisait d'écrire.
 * Un canal affiché doit être un canal qui répond.
 *
 * Le numéro ne s'affiche donc jamais seul : il est toujours précédé de
 * « WhatsApp » et lié par `whatsappUrl()` (`lib/whatsapp.ts`).
 */
