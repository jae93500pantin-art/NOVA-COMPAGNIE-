/**
 * Central WhatsApp contact configuration.
 *
 * The messaging feature was removed — all "contact us" actions point to this
 * WhatsApp Business line instead. Update WHATSAPP_NUMBER with the real number.
 */

/** International number, digits only (no +, spaces or dashes). */
export const WHATSAPP_NUMBER = "33744784991";
/** Human-readable display of the number. */
export const WHATSAPP_DISPLAY = "+33 7 44 78 49 91";

/** Build a wa.me deep link, optionally with a prefilled message. */
export function whatsappUrl(message?: string): string {
  const base = `https://wa.me/${WHATSAPP_NUMBER}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
