import "server-only";

import { serverEnv, isEmailConfigured } from "./config";
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY } from "./contact";

/**
 * Transactional email via the Resend REST API (no SDK dependency).
 *
 * Graceful degradation: sans `RESEND_API_KEY`, l'envoi est ignoré et la
 * fonction rend `false` — rien n'échoue pour autant.
 *
 * ⚠️ **Un seul e-mail transactionnel subsiste** : la validation d'un chauffeur
 * par un administrateur. `bookingRequestEmail`, `bookingConfirmedEmail` et
 * `paymentReceivedEmail` ont été retirés avec la réservation et le paiement
 * (statut d'annuaire) — la plateforme n'a plus de course à confirmer ni de
 * règlement à accuser. Les e-mails d'inscription et de mot de passe oublié,
 * eux, partent de Supabase (SMTP), pas d'ici.
 */

interface SendArgs {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendArgs): Promise<boolean> {
  if (!isEmailConfigured) return false;
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
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
      body: JSON.stringify({ from: serverEnv.emailFrom, to, subject, html }),
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

/* -------------------------------------------------------------------------- */
/*  Templates                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Échappe un texte destiné au corps HTML d'un e-mail.
 *
 * ⚠️ `layout` interpole ses valeurs telles quelles — c'est voulu, plusieurs
 * modèles y passent des liens `<a>`. Tout ce qui vient d'une SAISIE doit donc
 * être échappé au passage : le motif de refus est tapé par un administrateur,
 * et un `<` non échappé casserait la mise en page au mieux, injecterait du
 * balisage au pire.
 */
function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(heading: string, intro: string, rows: [string, string][], footer: string): string {
  const rowsHtml = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;color:#8a8a8a;font-size:14px">${k}</td><td style="padding:6px 0;text-align:right;color:#fff;font-size:14px;font-weight:600">${v}</td></tr>`
    )
    .join("");
  return `
  <div style="background:#0b0b0d;padding:32px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
    <div style="max-width:520px;margin:0 auto;background:#141417;border:1px solid #26262b;border-radius:20px;overflow:hidden">
      <div style="padding:24px 28px;border-bottom:1px solid #26262b">
        <span style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.5px">Nova <span style="color:#c9a75f">Compagnie</span></span>
      </div>
      <div style="padding:28px">
        <h1 style="margin:0 0 8px;font-size:20px;color:#fff">${heading}</h1>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#a0a0a5">${intro}</p>
        <table style="width:100%;border-collapse:collapse;border-top:1px solid #26262b;border-bottom:1px solid #26262b;margin-bottom:20px">${rowsHtml}</table>
        <p style="margin:0;font-size:12px;color:#6a6a70">${footer}</p>
      </div>
      <div style="padding:16px 28px;border-top:1px solid #26262b;text-align:center">
        <p style="margin:0;font-size:11px;color:#5a5a60">Nova Compagnie · www.novacompagnie.com · ${CONTACT_EMAIL} · ${CONTACT_PHONE_DISPLAY}</p>
      </div>
    </div>
  </div>`;
}

/**
 * Sent when an admin approves a driver profile from the /admin back-office.
 * `loginUrl` points at the real login route (/auth/login), not a placeholder.
 */
export function driverApprovedEmail(d: {
  firstName: string;
  loginUrl: string;
}): { subject: string; html: string } {
  return {
    subject: "Votre compte chauffeur est activé — Nova Compagnie",
    html: layout(
      `Félicitations ${d.firstName} !`,
      `Votre dossier a été vérifié et validé par notre équipe. Votre compte chauffeur Nova Compagnie est désormais actif : votre fiche est désormais visible dans l'annuaire, et vos clients peuvent vous contacter.`,
      [
        ["Statut du compte", "Activé"],
        ["Espace chauffeur", `<a href="${d.loginUrl}" style="color:#c9a75f">Se connecter</a>`],
      ],
      "Besoin d'aide pour démarrer ? Répondez à cet e-mail ou contactez-nous sur WhatsApp."
    ),
  };
}

/**
 * Refus d'un dossier chauffeur, avec son motif.
 *
 * ⚠️ Le motif est **obligatoire** dans le corps du message. Un refus sans
 * explication renvoie le chauffeur déposer exactement la même pièce, et
 * l'administrateur la refuse à nouveau : personne n'avance. L'e-mail dit donc
 * ce qui bloque et rappelle que le dossier se reprend — un refus n'est pas une
 * exclusion.
 */
export function driverRejectedEmail(d: {
  firstName: string;
  reasonLabel: string;
  note: string;
  resumeUrl: string;
}): { subject: string; html: string } {
  const rows: [string, string][] = [["Motif", d.reasonLabel]];
  if (d.note.trim()) rows.push(["Précision", escapeHtml(d.note.trim())]);
  rows.push([
    "Reprendre mon dossier",
    `<a href="${d.resumeUrl}" style="color:#c9a75f">Déposer à nouveau mes pièces</a>`,
  ]);

  return {
    subject: "Votre dossier chauffeur demande une correction — Nova Compagnie",
    html: layout(
      `Bonjour ${d.firstName},`,
      `Nous avons examiné votre dossier et il ne peut pas être validé en l'état. Rien n'est perdu : corrigez le point ci-dessous et redéposez vos pièces, nous les examinerons à nouveau.`,
      rows,
      "Une question sur ce motif ? Répondez à cet e-mail ou écrivez-nous sur WhatsApp."
    ),
  };
}

/**
 * Rappel d'échéance, 30 jours avant l'expiration d'une pièce.
 *
 * ⚠️ Envoyé au chauffeur ET visible de l'administrateur, parce qu'une pièce
 * expirée retire la fiche de l'annuaire : le chauffeur doit pouvoir l'éviter,
 * pas le découvrir.
 */
export function documentExpiringEmail(d: {
  firstName: string;
  documentLabel: string;
  expiresAt: string;
  daysLeft: number;
  resumeUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `${d.documentLabel} : expire dans ${d.daysLeft} jours — Nova Compagnie`,
    html: layout(
      `Bonjour ${d.firstName},`,
      `Une pièce de votre dossier arrive à échéance. Passé cette date, votre fiche est retirée de l'annuaire automatiquement — le temps que vous déposiez la nouvelle version.`,
      [
        ["Pièce", d.documentLabel],
        ["Échéance", d.expiresAt],
        ["Jours restants", String(d.daysLeft)],
        [
          "Mettre à jour",
          `<a href="${d.resumeUrl}" style="color:#c9a75f">Déposer la nouvelle pièce</a>`,
        ],
      ],
      "Vous recevez ce rappel une seule fois par pièce."
    ),
  };
}
