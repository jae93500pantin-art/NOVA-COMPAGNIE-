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

  let savedId: string | null = null;
  if (db) {
    const { data, error } = await db
      .from("contact_messages")
      .insert({
        first_name: draft.firstName,
        last_name: draft.lastName,
        email: draft.email,
        phone: draft.phone || null,
        type: draft.type,
        message: draft.message,
      })
      .select("id")
      .maybeSingle();
    if (error || !data) {
      console.error(`[contact] enregistrement refusé : ${error?.message ?? "aucune ligne"}`);
    } else {
      savedId = data.id as string;
    }
  }

  const emailed = await sendEmail({
    to: CONTACT_EMAIL,
    ...contactMessageEmail({
      name: `${draft.firstName} ${draft.lastName}`,
      email: draft.email,
      phone: draft.phone,
      typeLabel: CONTACT_TYPE_LABELS[draft.type as ContactType],
      message: draft.message,
      saved: Boolean(savedId),
    }),
  });

  if (savedId && emailed) {
    // Trace de la notification, pour retrouver un message que l'e-mail n'a
    // pas porté. Un échec ici ne change rien pour le visiteur.
    await db!.from("contact_messages").update({ emailed: true }).eq("id", savedId);
  }

  if (!savedId && !emailed) {
    return Response.json({ error: "contact.errorSend" }, { status: 502 });
  }
  return Response.json({ ok: true, saved: Boolean(savedId), emailed });
}
