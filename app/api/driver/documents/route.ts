import { NextRequest } from "next/server";
import { getServerUser } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/config";
import { rateLimit, sanitizeText } from "@/lib/validation";
import {
  DOCUMENT_KINDS,
  DOCUMENT_LABELS,
  MAX_DOCUMENT_BYTES,
  ALLOWED_DOCUMENT_TYPES,
  documentPath,
  type DriverDocumentKind,
} from "@/lib/driverDocuments";
import {
  supportedDocumentKinds,
  isUnknownEnumError,
} from "@/lib/documentSupport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "driver-docs";

/**
 * Le message rendu quand la base n'accepte pas encore ce type de pièce.
 *
 * ⚠️ Il nomme la pièce et dit **quoi faire** (continuer sans elle) : « Type de
 * pièce indisponible » laisserait le chauffeur réessayer indéfiniment avec le
 * même fichier, persuadé que c'est son PDF qui est en cause.
 */
function unavailableMessage(kind: DriverDocumentKind): string {
  return `${DOCUMENT_LABELS[kind].label} : le dépôt de cette pièce n'est pas encore ouvert sur la plateforme. Poursuivez votre inscription sans elle, nous vous la demanderons ensuite.`;
}

/**
 * Pièces justificatives d'un chauffeur.
 *
 *  GET  → la liste de SES pièces (type, statut, remarque de l'administrateur).
 *  POST → dépose ou remplace une pièce (multipart).
 *
 * ## Ce que le navigateur ne fait pas
 *
 * Le fichier ne part **jamais directement** vers Supabase Storage depuis le
 * navigateur. Il passerait alors par la clé anon, avec les seules règles que
 * Storage sait exprimer — ni la taille, ni le type réel, ni le rôle de
 * l'appelant. Tout transite par ici, où l'on vérifie la session, le rôle, le
 * type MIME et le poids avant d'écrire.
 *
 * ## Le bucket est PRIVÉ
 *
 * ⚠️ Aucune URL publique n'est jamais produite. Une pièce d'identité derrière
 * une URL publique, même longue et difficile à deviner, reste accessible à
 * quiconque obtient le lien — dans un journal, un partage d'écran, un en-tête
 * `Referer`. La consultation par un administrateur passe par une URL signée à
 * durée de vie courte, produite à la demande.
 */

async function guard() {
  const session = await getServerUser();
  if (session.state === "unconfigured") {
    return {
      error: Response.json(
        { error: "Dépôt indisponible : Supabase n'est pas configuré" },
        { status: 503 }
      ),
    } as const;
  }
  if (session.state === "anonymous") {
    return {
      error: Response.json({ error: "Authentification requise" }, { status: 401 }),
    } as const;
  }
  if (session.user.role !== "driver") {
    return {
      error: Response.json({ error: "Compte chauffeur requis" }, { status: 403 }),
    } as const;
  }
  const db = isSupabaseAdminConfigured ? getSupabaseAdmin() : null;
  if (!db) {
    return {
      error: Response.json(
        { error: "Dépôt indisponible : SUPABASE_SERVICE_ROLE_KEY manquante" },
        { status: 503 }
      ),
    } as const;
  }
  return { user: session.user, db } as const;
}

export async function GET() {
  const g = await guard();
  if ("error" in g) return g.error;

  const { data, error } = await g.db
    .from("driver_documents")
    // `storage_path` n'est PAS renvoyé : le chauffeur n'a rien à faire du
    // chemin interne, et le publier n'apporterait qu'une surface d'attaque.
    .select("id, kind, status, review_note, mime_type, size_bytes, created_at")
    .eq("driver_id", g.user.id);

  if (error) {
    return Response.json({ error: "Lecture impossible" }, { status: 500 });
  }

  /**
   * `supportedKinds` dit au formulaire ce que la base accepte **aujourd'hui**.
   *
   * ⚠️ Sans cette information, le formulaire exige des pièces que tout dépôt
   * rejette : le chauffeur dépose, reçoit une erreur, et l'étape reste bloquée
   * sans que rien n'explique pourquoi. `null` = indéterminé, et le formulaire
   * reste alors sur la règle complète (voir `lib/documentSupport.ts`).
   */
  const supportedKinds = await supportedDocumentKinds();

  return Response.json({ documents: data ?? [], supportedKinds });
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  // Un dépôt est lourd : le plafond est bas.
  if (!rateLimit(`driver-docs:${ip}`, 10, 60_000).ok) {
    return Response.json({ error: "Trop de dépôts" }, { status: 429 });
  }

  const g = await guard();
  if ("error" in g) return g.error;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Requête invalide" }, { status: 400 });
  }

  const kind = sanitizeText(form.get("kind"), 24) as DriverDocumentKind;
  if (!DOCUMENT_KINDS.includes(kind)) {
    return Response.json({ error: "Type de pièce inconnu" }, { status: 400 });
  }

  /**
   * ⚠️ Un type que l'enum de la base ne connaît pas est refusé **avant** le
   * dépôt du fichier, pas après.
   *
   * L'ordre compte : l'insertion a lieu après l'écriture dans le bucket, donc
   * attendre l'erreur Postgres laisserait le fichier déposé sans aucune ligne
   * pour le désigner — une pièce d'identité orpheline, que plus rien ne
   * permet de retrouver pour l'effacer (le même piège que la suppression d'un
   * dossier). Et le statut : **503, pas 400** — l'appelant n'a rien fait de
   * mal, c'est la base qui n'est pas à jour.
   */
  const supported = await supportedDocumentKinds();
  if (supported && !supported.includes(kind)) {
    console.error(
      `[documents] type « ${kind} » absent de l'enum driver_document_kind — migration non appliquée`
    );
    return Response.json({ error: unavailableMessage(kind) }, { status: 503 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Fichier manquant" }, { status: 400 });
  }
  if (file.size === 0) {
    return Response.json({ error: "Fichier vide" }, { status: 400 });
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return Response.json(
      { error: `Fichier trop lourd (max ${MAX_DOCUMENT_BYTES / 1024 / 1024} Mo)` },
      { status: 413 }
    );
  }
  if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
    return Response.json(
      { error: "Formats acceptés : JPEG, PNG, WebP ou PDF" },
      { status: 415 }
    );
  }

  // Le chemin est dérivé du compte et du type, jamais du nom de fichier
  // envoyé : un nom contrôlé par l'appelant permet de sortir du dossier
  // (« ../ ») ou d'écraser la pièce d'un autre.
  const path = documentPath(g.user.id, kind, file.type);

  const { error: uploadError } = await g.db.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });

  if (uploadError) {
    console.error(`[documents] dépôt refusé : ${uploadError.message}`);
    return Response.json(
      {
        error:
          "Dépôt impossible. Le bucket « driver-docs » existe-t-il, en privé ?",
      },
      { status: 500 }
    );
  }

  /**
   * Redéposer une pièce la REMPLACE et la remet en attente d'examen : une
   * pièce déjà validée puis modifiée doit être réexaminée, sinon il suffirait
   * de faire valider un document propre puis de le remplacer.
   */
  const { error: dbError } = await g.db.from("driver_documents").upsert(
    {
      driver_id: g.user.id,
      kind,
      storage_path: path,
      mime_type: file.type,
      size_bytes: file.size,
      status: "pending",
      review_note: null,
      reviewed_at: null,
    },
    { onConflict: "driver_id,kind" }
  );

  if (dbError) {
    console.error(`[documents] enregistrement refusé : ${dbError.message}`);

    /**
     * Le filet de dernier recours : l'enum a bien refusé la valeur.
     *
     * ⚠️ Le contrôle ci-dessus lit l'enum par le schéma publié et ne peut pas
     * toujours répondre — API injoignable, schéma en cache de quelques
     * secondes juste après une migration, lecture mise en défaut. On ne peut
     * donc pas se contenter d'un `500` générique ici : c'est exactement le cas
     * qui a bloqué l'étape 3 sans que rien ne l'explique.
     *
     * ⚠️ Et le fichier déjà déposé est retiré : l'insertion ayant échoué,
     * aucune ligne ne le désigne plus. Le laisser conserverait une pièce
     * d'identité que personne ne retrouverait pour l'effacer.
     */
    if (isUnknownEnumError(dbError.message)) {
      await g.db.storage
        .from(BUCKET)
        .remove([path])
        .catch(() => undefined);
      return Response.json({ error: unavailableMessage(kind) }, { status: 503 });
    }

    return Response.json(
      {
        error:
          "Votre pièce a bien été reçue mais n'a pas pu être enregistrée. Réessayez dans un instant.",
      },
      { status: 500 }
    );
  }

  return Response.json({ ok: true, kind });
}
