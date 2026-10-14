import { NextRequest } from "next/server";
import { isEmailConfigured, isSupabaseAdminConfigured } from "@/lib/config";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit, sanitizeText } from "@/lib/validation";
import { QUOTE_HONEYPOT_FIELD, isHoneypotFilled } from "@/lib/quoteRequest";
import {
  CONTACT_LIMITS,
  CONTACT_TYPE_LABELS,
  contactError,
  type ContactType,
} from "@/lib/contactMessage";
import { contactMessageEmail, sendEmail } from "@/lib/email";
import { CONTACT_EMAIL } from "@/lib/contact";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Formulaire `/contact` → `contact_messages` + e-mail à l'équipe.
 * **Aucune session requise.**
 *
 * ## ⚠️ La base fait foi, l'e-mail notifie — comme `/api/quotes`
 *
 * Le message est **enregistré d'abord**, puis notifié à `CONTACT_EMAIL`.
 * Un refus de Resend ne fait donc plus perdre le message.
 *
 * La route répond un succès si **l'un des deux** a réussi :
 * - enregistré, e-mail refusé → succès : le message est en base ;
 * - pas enregistré (table absente tant que la migration du 2026-10-14 n'est
 *   pas passée, ou service role manquant), e-mail parti → succès : le message
 *   est dans la boîte de l'équipe. Refuser ici casserait un formulaire qui
 *   fonctionne, pour une migration en retard ;
 * - ni l'un ni l'autre → **502**, jamais un succès simulé : le visiteur sait
 *   que rien n'est parti et peut écrire sur WhatsApp.
 *
 * Les erreurs sont des **clés i18n** (`contact.*`) : le formulaire est
 * bilingue.
 */

/**
 * Colonne absente : `42703` quand elle est nommée dans un `select`,
 * `PGRST204` quand elle est dans le corps d'un insert (cache de schéma
 * PostgREST) — même règle que `/api/reviews`.
 */
function isMissingColumn(err: { code?: string } | null | undefined): boolean {
  return err?.code === "42703" || err?.code === "PGRST204";
}

function ipOf(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Champ d'une ligne : un retour à la ligne n'a rien à faire dans un objet d'e-mail. */
function line(input: unknown, max: number): string {
  return sanitizeText(input, max).replace(/[\r\n]+/g, " ");
}

export async function POST(req: NextRequest) {
  // Même cadence que les devis : route ouverte qui déclenche un e-mail.
  const ip = ipOf(req);
  if (
    !rateLimit(`contact:${ip}`, 5, 60_000).ok ||
    !rateLimit(`contact-hour:${ip}`, 20, 3_600_000).ok
  ) {
    return Response.json({ error: "contact.errorRateLimited" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "contact.errorSend" }, { status: 400 });
  }

  // Robot : faux succès, rien d'envoyé (voir `QUOTE_HONEYPOT_FIELD`).
  if (isHoneypotFilled(body[QUOTE_HONEYPOT_FIELD])) {
    console.warn(`[contact] champ piège rempli, message ignoré (${ip})`);
    return Response.json({ ok: true });
  }

  const draft = {
    firstName: line(body.firstName, CONTACT_LIMITS.firstName),
    lastName: line(body.lastName, CONTACT_LIMITS.lastName),
    email: line(body.email, CONTACT_LIMITS.email),
    phone: line(body.phone, CONTACT_LIMITS.phone),
    type: line(body.type, 40),
    message: sanitizeText(body.message, CONTACT_LIMITS.message),
  };

  const invalid = contactError(draft);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });

  const db = isSupabaseAdminConfigured ? getSupabaseAdmin() : null;
  if (!db && !isEmailConfigured) {
    return Response.json({ error: "contact.errorUnavailable" }, { status: 503 });
  }

  const typeLabel = CONTACT_TYPE_LABELS[draft.type as ContactType];
  const name = `${draft.firstName} ${draft.lastName}`;

  /**
   * ⚠️ Colonnes de la table RÉELLE, relue le 2026-10-14 : `name`, `email`,
   * `subject`, `message`, `handled_at`, `created_at`. Elle a été créée
   * hors du dépôt, sans `phone` : le téléphone est envoyé s'il est saisi, et
   * la ligne est réécrite sans lui si la colonne manque — il reste dans
   * l'e-mail. Ajouter la colonne (migration du 2026-10-14) suffit à le
   * conserver, sans redéployer.
   */
  let savedId: string | null = null;
  if (db) {
    const row: Record<string, string> = {
      name,
      email: draft.email,
      subject: typeLabel,
      message: draft.message,
    };
    const insert = (withPhone: boolean) =>
      db
        .from("contact_messages")
        .insert(withPhone ? { ...row, phone: draft.phone } : row)
        .select("id")
        .maybeSingle();

    let { data, error } = await insert(Boolean(draft.phone));
    if (draft.phone && isMissingColumn(error)) ({ data, error } = await insert(false));

    if (error || !data) {
      console.error(`[contact] enregistrement refusé : ${error?.message ?? "aucune ligne"}`);
    } else {
      savedId = data.id as string;
    }
  }

  const emailed = await sendEmail({
    to: CONTACT_EMAIL,
    ...contactMessageEmail({
      name,
      email: draft.email,
      phone: draft.phone,
      typeLabel,
      message: draft.message,
      saved: Boolean(savedId),
    }),
  });

  if (!savedId && !emailed) {
    return Response.json({ error: "contact.errorSend" }, { status: 502 });
  }
  return Response.json({ ok: true, saved: Boolean(savedId), emailed });
}
