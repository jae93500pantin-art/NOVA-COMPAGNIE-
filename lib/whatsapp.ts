/**
 * Le lien WhatsApp de mise en relation.
 *
 * La messagerie interne a été retirée : toute action « nous contacter » ouvre
 * cette ligne. ⚠️ Le numéro n'est **pas** défini ici — il vient de
 * `lib/contact.ts`, seule source des coordonnées, pour que la ligne WhatsApp
 * et le numéro affiché sur les pages de contact ne puissent pas diverger.
 */

import {
  CONTACT_PHONE_DIGITS,
  CONTACT_PHONE_DISPLAY,
} from "@/lib/contact";

/** International number, digits only (no +, spaces or dashes). */
export const WHATSAPP_NUMBER = CONTACT_PHONE_DIGITS;
/** Human-readable display of the number. */
export const WHATSAPP_DISPLAY = CONTACT_PHONE_DISPLAY;

/** Build a wa.me deep link, optionally with a prefilled message. */
export function whatsappUrl(message?: string): string {
  const base = `https://wa.me/${WHATSAPP_NUMBER}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
