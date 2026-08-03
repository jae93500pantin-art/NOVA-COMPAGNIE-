import "server-only";

import { serverEnv, isEmailConfigured } from "./config";

/**
 * Transactional email via the Resend REST API (no SDK dependency).
 *
 * Graceful degradation: when `RESEND_API_KEY` is absent the send is skipped and
 * returns false, so the booking flow keeps working in demo mode. Provide
 * `RESEND_API_KEY` (+ a verified `EMAIL_FROM`) to send real confirmation emails.
 */

interface SendArgs {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendArgs): Promise<boolean> {
  if (!isEmailConfigured || !to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
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
    return res.ok;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*  Templates                                                                 */
/* -------------------------------------------------------------------------- */

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
        <p style="margin:0;font-size:11px;color:#5a5a60">Nova Compagnie · www.novacompagnie.com · Contact WhatsApp : +33 7 44 78 49 91</p>
      </div>
    </div>
  </div>`;
}

interface BookingEmailData {
  clientName: string;
  driverName: string;
  vehicle: string;
  whenText: string;
  durationText: string;
  total: number;
}

export function bookingRequestEmail(d: BookingEmailData): { subject: string; html: string } {
  return {
    subject: "Votre demande de course a bien été reçue — Nova Compagnie",
    html: layout(
      `Demande envoyée, ${d.clientName} !`,
      `Votre demande a été transmise à ${d.driverName}. Vous recevrez un e-mail dès qu'elle sera acceptée, puis vous pourrez procéder au paiement.`,
      [
        ["Chauffeur", d.driverName],
        ["Véhicule", d.vehicle],
        ["Date", d.whenText],
        ["Durée", d.durationText],
        ["Montant estimé", `€${d.total}`],
      ],
      "Aucun débit n'est effectué tant que le chauffeur n'a pas accepté."
    ),
  };
}

export function bookingConfirmedEmail(d: BookingEmailData): { subject: string; html: string } {
  return {
    subject: "Votre course est confirmée — procédez au paiement — Nova Compagnie",
    html: layout(
      `Course confirmée, ${d.clientName} !`,
      `${d.driverName} a accepté votre course. Rendez-vous dans « Mes réservations » pour régler et finaliser votre réservation.`,
      [
        ["Chauffeur", d.driverName],
        ["Véhicule", d.vehicle],
        ["Date", d.whenText],
        ["Durée", d.durationText],
        ["Montant à régler", `€${d.total}`],
      ],
      "Moyens de paiement : carte bancaire, crypto ou espèces."
    ),
  };
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
      `Votre dossier a été vérifié et validé par notre équipe. Votre compte chauffeur Nova Compagnie est désormais actif : vous pouvez renseigner vos disponibilités et recevoir vos premières courses.`,
      [
        ["Statut du compte", "Activé"],
        ["Espace chauffeur", `<a href="${d.loginUrl}" style="color:#c9a75f">Se connecter</a>`],
      ],
      "Besoin d'aide pour démarrer ? Répondez à cet e-mail ou contactez-nous sur WhatsApp."
    ),
  };
}

export function paymentReceivedEmail(d: BookingEmailData): { subject: string; html: string } {
  return {
    subject: "Paiement confirmé — votre réservation est réglée — Nova Compagnie",
    html: layout(
      `Merci ${d.clientName}, paiement confirmé !`,
      `Votre réservation avec ${d.driverName} est réglée. Bon voyage !`,
      [
        ["Chauffeur", d.driverName],
        ["Véhicule", d.vehicle],
        ["Date", d.whenText],
        ["Durée", d.durationText],
        ["Montant payé", `€${d.total}`],
      ],
      "Un reçu détaillé est disponible dans votre espace Nova Compagnie."
    ),
  };
}
