import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/config";
import { rateLimit, sanitizeText } from "@/lib/validation";
import { getDirectoryDriver, getDirectoryDriverAccountId } from "@/lib/driverDirectory";
import {
  QUOTE_ERRORS,
  QUOTE_LIMITS,
  normalizeQuote,
  quoteError,
} from "@/lib/quoteRequest";
import { quoteRequestEmail, sendEmail } from "@/lib/email";
import { CONTACT_EMAIL } from "@/lib/contact";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Demande de devis adressée à un chauffeur référencé. **Aucune session
 * requise** — c'est le but : un annuaire dont il faut être inscrit pour
 * demander un prix n'a pas de visiteurs.
 *
 * ## ⚠️ Ce que cette route ne fait pas
 *
 * Elle ne réserve rien, ne bloque aucun créneau et **ne produit aucun
 * montant**. Un prix calculé ici serait un prix imposé au chauffeur (règle 3
 * du statut d'annuaire) et ferait de Nova le vendeur de la prestation. Le
 * devis est émis par le chauffeur ; cette route porte la demande.
 *
 * ## ⚠️ Pourquoi elle PERSISTE avant d'envoyer l'e-mail
 *
 * L'envoi transactionnel dépend d'un domaine vérifié chez Resend, qui ne l'est
 * pas encore : `sendEmail` répond `false` sans que rien ne soit en panne.
 * Si la demande ne vivait que dans cet e-mail, elle serait **perdue
 * silencieusement** — exactement le défaut du formulaire de contact, dont
 * l'envoi est simulé. L'écriture en base fait donc foi, et l'e-mail n'est
 * qu'une notification. L'inverse aurait été indéfendable : c'est la demande
 * d'un client, pas un journal technique.
 */

function ipOf(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  /**
   * ⚠️ Plafond bas, et sur deux fenêtres. Cette route est **ouverte**, elle
   * écrit en base et elle déclenche un envoi d'e-mail : c'est exactement la
   * forme qu'un robot de spam recherche. 5 par minute arrête la rafale,
   * 20 par heure arrête le remplissage lent que la première fenêtre laisse
   * passer.
   */
  const ip = ipOf(req);
  if (!rateLimit(`quote:${ip}`, 5, 60_000).ok) {
    return Response.json(
      { error: "Trop de demandes. Réessayez dans une minute." },
      { status: 429 }
    );
  }
  if (!rateLimit(`quote-hour:${ip}`, 20, 3_600_000).ok) {
    return Response.json(
      { error: "Trop de demandes depuis cette connexion." },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Requête invalide" }, { status: 400 });
  }

  const slug = sanitizeText(body.driverId, 80);
  const draft = normalizeQuote({
    name: sanitizeText(body.name, QUOTE_LIMITS.name),
    email: sanitizeText(body.email, QUOTE_LIMITS.email),
    phone: sanitizeText(body.phone, QUOTE_LIMITS.phone),
    trip: sanitizeText(body.trip, QUOTE_LIMITS.trip),
    details: sanitizeText(body.details, QUOTE_LIMITS.details),
  });

  // Les mêmes règles que le formulaire, rejouées : le navigateur n'est pas
  // une autorité, un POST direct contournerait sa validation.
  const invalid = quoteError(draft);
  if (invalid) {
    return Response.json({ error: QUOTE_ERRORS[invalid] }, { status: 400 });
  }

  const driver = slug ? await getDirectoryDriver(slug) : null;
  if (!driver) {
    return Response.json({ error: "Chauffeur introuvable" }, { status: 404 });
  }
  const driverUuid = await getDirectoryDriverAccountId(slug);
  const driverName = `${driver.firstName} ${driver.lastName}`.trim();

  const client = isSupabaseAdminConfigured ? getSupabaseAdmin() : null;
  if (!client) {
    /**
     * ⚠️ On refuse franchement au lieu de simuler un succès.
     *
     * Afficher « demande envoyée » sans rien enregistrer est le pire des deux
     * mondes : le visiteur attend un rappel qui ne viendra jamais, et il a
     * laissé son nom, son e-mail et son téléphone pour rien — une collecte de
     * données sans finalité. Le message propose WhatsApp, qui fonctionne sans
     * aucune clé.
     */
    return Response.json(
      {
        error:
          "L'envoi des demandes n'est pas encore actif sur cette installation. Contactez-nous par WhatsApp, nous transmettons au chauffeur.",
      },
      { status: 503 }
    );
  }

  const { data, error } = await client
    .from("quote_requests")
    .insert({
      driver_id: driverUuid,
      driver_slug: slug,
      name: draft.name,
      email: draft.email,
      phone: draft.phone,
      trip: draft.trip,
      details: draft.details || null,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error(`[quotes] enregistrement refusé : ${error?.message}`);
    return Response.json(
      {
        error:
          "Votre demande n'a pas pu être enregistrée. Réessayez, ou écrivez-nous par WhatsApp.",
      },
      { status: 500 }
    );
  }

  /**
   * ⚠️ La notification part vers l'adresse de Nova, **pas vers le chauffeur**.
   *
   * Deux raisons : la mise en relation est assistée (le téléphone et l'e-mail
   * du chauffeur ne sont pas publiés — `profiles` est en lecture propriétaire,
   * et les publier demande son consentement) ; et tant que le domaine n'est
   * pas vérifié chez Resend, un envoi vers une adresse tierce est refusé.
   * ⚠️ Un échec d'envoi ne fait PAS échouer la demande : elle est déjà en base.
   */
  const emailed = await sendEmail({
    to: CONTACT_EMAIL,
    ...quoteRequestEmail({
      driverName,
      driverSlug: slug,
      name: draft.name,
      email: draft.email,
      phone: draft.phone,
      trip: draft.trip,
      details: draft.details,
    }),
  });

  return Response.json({ ok: true, id: data.id, emailed });
}
