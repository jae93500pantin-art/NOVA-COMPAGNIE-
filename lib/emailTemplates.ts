import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY } from "./contact";
import { ADDRESS, EDITOR_DENOMINATION, SIREN } from "./legalEntity";

/**
 * Les modèles d'e-mails transactionnels — pur, sans `server-only`, pour être
 * testé et prévisualisé. L'envoi vit dans `lib/email.ts`, qui ré-exporte tout.
 *
 * ## Le gabarit : un seul, et ses règles
 *
 * Style « premium sombre » : fond #0B0F17, carte #111827, bordures #1F2937,
 * bouton champagne (la couleur d'accent du site), étiquettes cyan #38BDF8.
 *
 * - **Tables et styles en ligne**, jamais de `<style>` ni de flex/grid : Gmail
 *   retire les feuilles de style d'un e-mail transféré, Outlook n'affiche ni
 *   flex ni dégradé. Le bouton est un « bulletproof button » (cellule colorée
 *   + lien), le seul qui garde sa forme partout.
 * - `bgcolor` **en plus** de `background` : certains webmails n'en lisent
 *   qu'un des deux, et un fond blanc sous un texte gris clair est illisible.
 * - **Tout est échappé ici, au rendu.** Les modèles passent du TEXTE brut
 *   (`value`) et une URL à part (`href`) ; ils n'écrivent jamais de HTML.
 *   L'ancien gabarit interpolait ses valeurs telles quelles et laissait chaque
 *   modèle penser à `escapeHtml` — or deux d'entre eux portent une saisie
 *   publique (devis, contact). Un oubli injectait du balisage dans un e-mail
 *   que l'équipe ouvre.
 * - **Une version texte** accompagne chaque HTML : sans elle, les filtres
 *   anti-spam pénalisent l'envoi, et un client mail en texte seul n'affiche
 *   rien.
 *
 * ## ⚠️ Le pied de page légal
 *
 * Il dit qui écrit (l'éditeur, depuis `lib/legalEntity.ts`, jamais recopié)
 * et ce que Nova ne fait pas : un e-mail est la pièce qu'un client garde, et
 * celui d'un annuaire ne doit pas pouvoir se lire comme la confirmation d'une
 * course. Aucun montant n'apparaît dans aucun modèle (statut d'annuaire).
 */

/* -------------------------------------------------------------------------- */
/*  Palette                                                                   */
/* -------------------------------------------------------------------------- */

const C = {
  page: "#0B0F17",
  card: "#111827",
  inset: "#0D1320",
  border: "#1F2937",
  text: "#F9FAFB",
  body: "#9CA3AF",
  muted: "#6B7280",
  cyan: "#38BDF8",
  gold: "#C9A75F",
  onGold: "#0B0F17",
} as const;

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const SITE_URL = "https://www.novacompagnie.com";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface EmailRow {
  label: string;
  /** Texte brut — échappé au rendu. */
  value: string;
  /** Lien facultatif (`https:`, `mailto:`) posé sur la valeur. */
  href?: string;
  /** Pleine largeur, étiquette au-dessus : pour un message de plusieurs lignes. */
  stacked?: boolean;
}

export interface EmailContent {
  /** Texte d'aperçu affiché par la boîte de réception, à côté de l'objet. */
  preheader: string;
  eyebrow: string;
  heading: string;
  /** Paragraphes d'introduction, en texte brut. */
  intro: string[];
  rows?: EmailRow[];
  cta?: { label: string; href: string };
  note?: string;
  /** Pourquoi le destinataire reçoit ce message (pied de page). */
  reason: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  /** Adresse de réponse : le client qui a écrit, pour répondre en un clic. */
  replyTo?: string;
}

/* -------------------------------------------------------------------------- */
/*  Rendu                                                                     */
/* -------------------------------------------------------------------------- */

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Texte brut → HTML, retours à la ligne conservés. */
function para(raw: string): string {
  return escapeHtml(raw).replace(/\r?\n/g, "<br>");
}

/**
 * N'accepte que `https:`, `http:` et `mailto:`. Une URL `javascript:` venue
 * d'une saisie n'a rien à faire dans un lien, même si la plupart des clients
 * mail la neutralisent.
 */
function safeHref(href: string): string | null {
  const h = href.trim();
  // Variable de modèle Supabase (`{{ .ConfirmationURL }}`), remplacée par
  // Supabase à l'envoi — voir `supabaseAuthTemplates`.
  if (/^\{\{ \.[A-Za-z]+ \}\}$/.test(h)) return h;
  return /^(https?:|mailto:)/i.test(h) ? escapeHtml(h) : null;
}

function formatSiren(siren: string): string {
  return siren.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3");
}

function legalLines(): string[] {
  const lines = [
    "Nova Compagnie est un annuaire de chauffeurs VTC indépendants. Nova ne réalise aucun transport et n'encaisse aucune course : la prestation se convient et se règle directement avec le chauffeur.",
  ];
  const editor = [`Éditeur : ${EDITOR_DENOMINATION}`];
  if (SIREN) editor.push(`SIREN ${formatSiren(SIREN)}`);
  if (ADDRESS) editor.push(ADDRESS);
  lines.push(editor.join(" · "));
  lines.push(`${CONTACT_EMAIL} · WhatsApp ${CONTACT_PHONE_DISPLAY}`);
  return lines;
}

function rowHtml(row: EmailRow, last: boolean): string {
  const href = row.href ? safeHref(row.href) : null;
  const value = href
    ? `<a href="${href}" style="color:${C.cyan};text-decoration:none">${para(row.value)}</a>`
    : para(row.value);
  const sep = last ? "" : `border-bottom:1px solid ${C.border};`;

  if (row.stacked) {
    return `<tr><td colspan="2" style="padding:14px 18px;${sep}">
      <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${C.muted};padding-bottom:6px">${escapeHtml(row.label)}</div>
      <div style="font-size:14px;line-height:1.6;color:${C.text}">${value}</div>
    </td></tr>`;
  }
  return `<tr>
    <td valign="top" style="padding:12px 18px;${sep}font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${C.muted};white-space:nowrap">${escapeHtml(row.label)}</td>
    <td valign="top" align="right" style="padding:12px 18px;${sep}font-size:14px;font-weight:600;line-height:1.5;color:${C.text}">${value}</td>
  </tr>`;
}

function ctaHtml(cta: { label: string; href: string }): string {
  const href = safeHref(cta.href);
  if (!href) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 4px">
    <tr><td bgcolor="${C.gold}" style="background:${C.gold};border-radius:10px">
      <a href="${href}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:14px;font-weight:700;letter-spacing:0.3px;color:${C.onGold};text-decoration:none;border-radius:10px">${escapeHtml(cta.label)}</a>
    </td></tr>
  </table>`;
}

export function renderEmailHtml(subject: string, c: EmailContent): string {
  const rows = c.rows ?? [];
  const recap = rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.inset}" style="background:${C.inset};border:1px solid ${C.border};border-radius:12px;border-collapse:separate;margin-top:24px">
        ${rows.map((r, i) => rowHtml(r, i === rows.length - 1)).join("")}
      </table>`
    : "";

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page}" bgcolor="${C.page}">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(c.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page}">
<tr><td align="center" style="padding:40px 16px;font-family:${FONT}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
    <tr><td align="center" style="padding:0 0 24px">
      <a href="${SITE_URL}" style="text-decoration:none;font-family:${FONT};font-size:15px;font-weight:700;letter-spacing:5px;color:${C.text}">NOVA <span style="color:${C.gold}">COMPAGNIE</span></a>
    </td></tr>
    <tr><td bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.border};border-radius:16px;overflow:hidden">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td height="3" bgcolor="${C.gold}" style="background:${C.gold};height:3px;line-height:3px;font-size:0">&nbsp;</td></tr>
        <tr><td style="padding:32px 32px 36px">
          <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${C.cyan}">${escapeHtml(c.eyebrow)}</div>
          <h1 style="margin:10px 0 0;font-family:${FONT};font-size:24px;line-height:1.3;font-weight:700;letter-spacing:-0.3px;color:${C.text}">${escapeHtml(c.heading)}</h1>
          ${c.intro.map((p) => `<p style="margin:14px 0 0;font-size:15px;line-height:1.65;color:${C.body}">${para(p)}</p>`).join("")}
          ${recap}
          ${c.cta ? ctaHtml(c.cta) : ""}
          ${c.note ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:${C.muted}">${para(c.note)}</p>` : ""}
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:28px 12px 0;text-align:center">
      ${legalLines().map((l) => `<p style="margin:0 0 8px;font-size:11px;line-height:1.6;color:${C.muted}">${escapeHtml(l)}</p>`).join("")}
      <p style="margin:12px 0 0;font-size:11px;line-height:1.6;color:#4B5563">${escapeHtml(c.reason)}</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

export function renderEmailText(c: EmailContent): string {
  const out: string[] = ["NOVA COMPAGNIE", "", c.heading, "", ...c.intro.flatMap((p) => [p, ""])];
  for (const r of c.rows ?? []) {
    out.push(r.stacked ? `${r.label} :\n${r.value}` : `${r.label} : ${r.value}`);
    if (r.href && !r.href.startsWith("mailto:")) out.push(`  ${r.href}`);
  }
  if (c.rows?.length) out.push("");
  if (c.cta) out.push(`${c.cta.label} : ${c.cta.href}`, "");
  if (c.note) out.push(c.note, "");
  out.push("—", ...legalLines(), "", c.reason);
  return out.join("\n");
}

function build(subject: string, c: EmailContent, replyTo?: string): RenderedEmail {
  return {
    subject,
    html: renderEmailHtml(subject, c),
    text: renderEmailText(c),
    ...(replyTo ? { replyTo } : {}),
  };
}

const REASON_DRIVER =
  "Vous recevez cet e-mail parce que vous avez un compte chauffeur sur Nova Compagnie.";
const REASON_TEAM =
  "Notification interne envoyée à l'équipe Nova Compagnie depuis un formulaire du site.";

/* -------------------------------------------------------------------------- */
/*  Modèles                                                                   */
/* -------------------------------------------------------------------------- */

/** Validation d'un chauffeur par un administrateur (`/admin`). */
export function driverApprovedEmail(d: { firstName: string; loginUrl: string }): RenderedEmail {
  return build("Votre compte chauffeur est activé — Nova Compagnie", {
    preheader: "Votre fiche est désormais visible dans l'annuaire.",
    eyebrow: "Dossier validé",
    heading: `Félicitations ${d.firstName}`,
    intro: [
      "Votre dossier a été vérifié et validé par notre équipe. Votre fiche est désormais visible dans l'annuaire Nova Compagnie, et les clients peuvent vous contacter.",
    ],
    rows: [{ label: "Statut du compte", value: "Activé" }],
    cta: { label: "Accéder à mon espace", href: d.loginUrl },
    note: "Besoin d'aide pour démarrer ? Répondez à cet e-mail ou écrivez-nous sur WhatsApp.",
    reason: REASON_DRIVER,
  });
}

/**
 * Refus d'un dossier, avec son motif. ⚠️ Le motif est obligatoire : sans lui,
 * le chauffeur redépose la même pièce et personne n'avance.
 */
export function driverRejectedEmail(d: {
  firstName: string;
  reasonLabel: string;
  note: string;
  resumeUrl: string;
}): RenderedEmail {
  const rows: EmailRow[] = [{ label: "Motif", value: d.reasonLabel }];
  if (d.note.trim()) rows.push({ label: "Précision", value: d.note.trim(), stacked: true });

  return build("Votre dossier chauffeur demande une correction — Nova Compagnie", {
    preheader: `Motif : ${d.reasonLabel}. Votre dossier se reprend en quelques minutes.`,
    eyebrow: "Dossier à corriger",
    heading: `Bonjour ${d.firstName},`,
    intro: [
      "Nous avons examiné votre dossier et il ne peut pas être validé en l'état. Rien n'est perdu : corrigez le point ci-dessous et redéposez vos pièces, nous les examinerons à nouveau.",
    ],
    rows,
    cta: { label: "Reprendre mon dossier", href: d.resumeUrl },
    note: "Une question sur ce motif ? Répondez à cet e-mail ou écrivez-nous sur WhatsApp.",
    reason: REASON_DRIVER,
  });
}

/** Rappel 30 jours avant l'échéance d'une pièce — sa péremption retire la fiche. */
export function documentExpiringEmail(d: {
  firstName: string;
  documentLabel: string;
  expiresAt: string;
  daysLeft: number;
  resumeUrl: string;
}): RenderedEmail {
  return build(`${d.documentLabel} : expire dans ${d.daysLeft} jours — Nova Compagnie`, {
    preheader: `Échéance le ${d.expiresAt} : déposez la nouvelle version pour rester visible.`,
    eyebrow: "Échéance à venir",
    heading: `Bonjour ${d.firstName},`,
    intro: [
      "Une pièce de votre dossier arrive à échéance. Passé cette date, votre fiche est retirée de l'annuaire automatiquement, le temps que vous déposiez la nouvelle version.",
    ],
    rows: [
      { label: "Pièce", value: d.documentLabel },
      { label: "Échéance", value: d.expiresAt },
      { label: "Jours restants", value: String(d.daysLeft) },
    ],
    cta: { label: "Déposer la nouvelle pièce", href: d.resumeUrl },
    note: "Vous recevez ce rappel une seule fois par pièce.",
    reason: REASON_DRIVER,
  });
}

/**
 * Demande de devis déposée depuis une fiche (formulaire PUBLIC).
 *
 * ⚠️ Aucun montant, et il ne faut pas en ajouter : le devis est chiffré par
 * le chauffeur (statut d'annuaire, règle 3). `replyTo` = le client, pour que
 * l'équipe lui réponde sans recopier son adresse.
 */
export function quoteRequestEmail(d: {
  driverName: string;
  driverSlug: string;
  name: string;
  email: string;
  phone: string;
  trip: string;
  details?: string;
}): RenderedEmail {
  const rows: EmailRow[] = [
    { label: "Chauffeur demandé", value: d.driverName },
    { label: "Client", value: d.name },
    { label: "E-mail", value: d.email, href: `mailto:${d.email}` },
    { label: "Téléphone", value: d.phone },
    { label: "Trajet", value: d.trip, stacked: true },
  ];
  if (d.details) rows.push({ label: "Précisions", value: d.details, stacked: true });

  return build(
    `Demande de devis — ${d.driverName}`,
    {
      preheader: `${d.name} souhaite être mis en relation avec ${d.driverName}.`,
      eyebrow: "Nouvelle demande de devis",
      heading: `Mise en relation avec ${d.driverName}`,
      intro: [
        "Un visiteur souhaite être mis en relation avec ce chauffeur. Transmettez-lui la demande : le devis et la facturation relèvent du chauffeur.",
      ],
      rows,
      cta: {
        label: "Ouvrir la fiche",
        href: `${SITE_URL}/drivers/${encodeURIComponent(d.driverSlug)}`,
      },
      note: "Demande enregistrée dans la console (/admin, « Demandes de devis »). Nova Compagnie ne chiffre ni ne facture la prestation. Répondre à cet e-mail écrit directement au client.",
      reason: REASON_TEAM,
    },
    d.email
  );
}

/** Message du formulaire `/contact` (formulaire PUBLIC). */
export function contactMessageEmail(d: {
  name: string;
  email: string;
  phone: string;
  typeLabel: string;
  message: string;
  /** Le message a-t-il été enregistré dans `contact_messages` ? */
  saved: boolean;
}): RenderedEmail {
  const rows: EmailRow[] = [
    { label: "Type de demande", value: d.typeLabel },
    { label: "Nom", value: d.name },
    { label: "E-mail", value: d.email, href: `mailto:${d.email}` },
  ];
  if (d.phone) rows.push({ label: "Téléphone", value: d.phone });
  rows.push({ label: "Message", value: d.message, stacked: true });

  return build(
    `Contact — ${d.typeLabel} — ${d.name}`,
    {
      preheader: d.message.slice(0, 120),
      eyebrow: "Formulaire de contact",
      heading: `Nouveau message de ${d.name}`,
      intro: ["Un visiteur a écrit depuis la page Contact du site."],
      rows,
      cta: { label: "Répondre", href: `mailto:${d.email}` },
      // ⚠️ Dire la vérité sur l'enregistrement : si la table manque (migration
      // en retard), cet e-mail est la seule copie du message.
      note: d.saved
        ? "Message enregistré en base (table contact_messages). Répondre à cet e-mail écrit directement au visiteur."
        : "⚠️ Ce message n'a PAS pu être enregistré en base : cet e-mail en est la seule copie. Répondre à cet e-mail écrit directement au visiteur.",
      reason: REASON_TEAM,
    },
    d.email
  );
}

/**
 * Bienvenue, à la création d'un compte (`/api/auth/register`).
 *
 * ⚠️ Ce n'est PAS l'e-mail de confirmation d'adresse : celui-là part de
 * Supabase (SMTP), et son modèle se colle dans le dashboard — voir
 * `supabase/email-templates/`. Celui-ci n'est envoyé que lorsque le compte
 * est ouvert d'emblée (confirmation désactivée), pour que l'inscription
 * laisse une trace dans la boîte du nouveau membre.
 */
export function welcomeEmail(d: {
  firstName: string;
  role: "client" | "driver";
  origin: string;
}): RenderedEmail {
  const driver = d.role === "driver";
  return build(
    driver
      ? "Bienvenue chez Nova Compagnie — votre dossier chauffeur"
      : "Bienvenue chez Nova Compagnie",
    {
      preheader: driver
        ? "Complétez votre dossier pour apparaître dans l'annuaire."
        : "Votre compte est ouvert : parcourez l'annuaire des chauffeurs.",
      eyebrow: driver ? "Compte chauffeur créé" : "Compte créé",
      heading: `Bienvenue ${d.firstName}`,
      intro: driver
        ? [
            "Votre compte chauffeur est créé. Pour apparaître dans l'annuaire, complétez votre dossier : profil, véhicule et pièces justificatives.",
            "Notre équipe vérifie chaque pièce avant de publier votre fiche. Vous recevrez un e-mail dès la validation.",
          ]
        : [
            "Votre compte Nova Compagnie est ouvert. Parcourez l'annuaire, comparez les tarifs annoncés par chaque chauffeur et contactez celui que vous choisissez.",
            "Votre compte vous permet aussi de publier un avis sur un chauffeur.",
          ],
      rows: driver
        ? [
            { label: "Étape 1", value: "Profil et permis" },
            { label: "Étape 2", value: "Véhicule" },
            { label: "Étape 3", value: "Pièces justificatives" },
          ]
        : undefined,
      cta: driver
        ? { label: "Compléter mon dossier", href: `${d.origin}/compte/onboarding` }
        : { label: "Voir les chauffeurs", href: `${d.origin}/drivers` },
      note: "Vous n'êtes pas à l'origine de cette inscription ? Répondez à cet e-mail, nous supprimerons le compte.",
      reason: "Vous recevez cet e-mail parce qu'un compte vient d'être créé avec cette adresse sur novacompagnie.com.",
    }
  );
}

/* -------------------------------------------------------------------------- */
/*  Modèles Supabase (confirmation d'adresse, mot de passe oublié)            */
/* -------------------------------------------------------------------------- */

/**
 * Les e-mails d'authentification partent de **Supabase** (SMTP), pas de
 * `sendEmail` : leurs modèles se collent dans le dashboard (Authentication →
 * Email Templates). Ils sont produits ici, avec le même gabarit, et écrits
 * dans `supabase/email-templates/` par `tests/emailTemplates.test.ts`
 * (`UPDATE_EMAIL_TEMPLATES=1 npm test`) — un test échoue si les fichiers ne
 * correspondent plus au gabarit.
 *
 * `{{ .ConfirmationURL }}` est une variable Supabase, remplacée à l'envoi.
 * ⚠️ Coller un fichier ici ne suffit pas à le faire partir : la confirmation
 * d'adresse reste coupée tant que `mailer_autoconfirm` vaut `true`.
 */
export function supabaseAuthTemplates(): { file: string; subject: string; html: string }[] {
  const confirm = "Confirmez votre adresse e-mail — Nova Compagnie";
  const recovery = "Réinitialisez votre mot de passe — Nova Compagnie";
  return [
    {
      file: "confirm-signup.html",
      subject: confirm,
      html: renderEmailHtml(confirm, {
        preheader: "Un clic pour activer votre compte Nova Compagnie.",
        eyebrow: "Inscription",
        heading: "Confirmez votre adresse e-mail",
        intro: [
          "Merci de votre inscription sur Nova Compagnie. Confirmez votre adresse pour activer votre compte.",
        ],
        cta: { label: "Confirmer mon adresse", href: "{{ .ConfirmationURL }}" },
        note: "Ce lien est à usage unique et expire après un délai limité. Vous n'êtes pas à l'origine de cette inscription ? Ignorez cet e-mail : aucun compte ne sera activé.",
        reason:
          "Vous recevez cet e-mail parce qu'une inscription a été demandée avec cette adresse sur novacompagnie.com.",
      }),
    },
    {
      file: "reset-password.html",
      subject: recovery,
      html: renderEmailHtml(recovery, {
        preheader: "Choisissez un nouveau mot de passe pour votre compte.",
        eyebrow: "Sécurité du compte",
        heading: "Réinitialisez votre mot de passe",
        intro: [
          "Une réinitialisation du mot de passe a été demandée pour votre compte Nova Compagnie. Cliquez ci-dessous pour en choisir un nouveau.",
        ],
        cta: { label: "Choisir un nouveau mot de passe", href: "{{ .ConfirmationURL }}" },
        note: "Ce lien est à usage unique et expire après un délai limité. Vous n'avez rien demandé ? Ignorez cet e-mail : votre mot de passe actuel reste valable.",
        reason:
          "Vous recevez cet e-mail parce qu'une réinitialisation a été demandée pour cette adresse sur novacompagnie.com.",
      }),
    },
  ];
}
