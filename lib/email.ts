import "server-only";

import { serverEnv, isEmailConfigured } from "./config";

/**
 * Transactional email via the Resend REST API (no SDK dependency).
 *
 * Graceful degradation: sans `RESEND_API_KEY`, l'envoi est ignoré et la
 * fonction rend `false` — rien n'échoue pour autant.
 *
 * Les modèles vivent dans `lib/emailTemplates.ts` (pur, testé) et sont
 * ré-exportés ici. `bookingRequestEmail`, `bookingConfirmedEmail` et
 * `paymentReceivedEmail` ont été retirés avec la réservation et le paiement
 * (statut d'annuaire). La confirmation d'adresse et le mot de passe oublié
 * partent de Supabase (SMTP) : leurs modèles sont dans
 * `supabase/email-templates/`, à coller dans le dashboard.
 */

export {
  contactMessageEmail,
  documentExpiringEmail,
  driverApprovedEmail,
  driverRejectedEmail,
  quoteRequestEmail,
  welcomeEmail,
} from "./emailTemplates";

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  /** Version texte : sans elle, les filtres anti-spam pénalisent l'envoi. */
  text?: string;
  /** Adresse de réponse (le visiteur qui a écrit). Ignorée si invalide. */
  replyTo?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendEmail({ to, subject, html, text, replyTo }: SendArgs): Promise<boolean> {
  if (!isEmailConfigured) return false;
  if (!to || !EMAIL_RE.test(to)) {
    console.warn(`[email] adresse invalide, envoi ignoré : ${to}`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serverEnv.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: serverEnv.emailFrom,
        to,
        subject,
        html,
        ...(text ? { text } : {}),
        ...(replyTo && EMAIL_RE.test(replyTo) ? { reply_to: replyTo } : {}),
      }),
    });

    // Le corps de la réponse est la seule trace exploitable d'un envoi : sans
    // lui, un refus de Resend (domaine non vérifié, destinataire interdit,
    // quota) se réduit à `false` et devient indiagnosticable. On le journalise
    // — sans jamais écrire la clé, qui ne circule que dans l'en-tête.
    const body = (await res.json().catch(() => null)) as
      | { id?: string; message?: string; name?: string }
      | null;

    if (!res.ok) {
      console.error(
        `[email] Resend a refusé l'envoi vers ${to} (HTTP ${res.status})` +
          `${body?.name ? ` ${body.name}` : ""}${body?.message ? ` : ${body.message}` : ""}`
      );
      return false;
    }

    // L'id permet de retrouver la livraison dans les journaux Resend. Accepté
    // n'est pas livré : un rebond ou un classement en spam arrive après.
    console.info(`[email] accepté par Resend pour ${to} — id ${body?.id ?? "?"}`);
    return true;
  } catch (err) {
    console.error(
      `[email] échec réseau vers Resend : ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  }
}
