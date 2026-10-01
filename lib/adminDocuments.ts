import "server-only";

import { adminDb } from "@/lib/admin";
import type { DriverDocumentKind } from "@/lib/driverDocuments";

/**
 * Consultation des pièces justificatives par un administrateur.
 *
 * ## ⚠️ Pourquoi des URL SIGNÉES, et pas des URL publiques
 *
 * Le bucket `driver-docs` est **privé** et doit le rester : il contient des
 * permis de conduire, des cartes d'identité et des Kbis. Une URL publique reste
 * accessible à quiconque l'obtient — par un journal serveur, un partage
 * d'écran, un en-tête `Referer`. Une URL signée est un lien **temporaire**,
 * fabriqué à la demande, qui cesse de fonctionner passé son délai : capturé, il
 * ne vaut plus rien quelques minutes plus tard.
 *
 * ## ⚠️ Trois règles que ce module fait respecter
 *
 * 1. **`server-only`.** La signature exige la clé de service ; ce fichier ne
 *    peut donc pas entrer dans un bundle navigateur, et l'import échouerait à
 *    la compilation si quelqu'un l'essayait.
 * 2. **Jamais sans `requireAdmin()` d'abord.** Ce module ne vérifie AUCUNE
 *    identité — c'est l'appelant qui doit l'avoir fait, comme pour
 *    `voucherSource` avant lui. Signer sans contrôle publierait les pièces
 *    d'identité de tous les chauffeurs à qui sait deviner une route.
 * 3. **Cinq minutes.** Assez pour regarder un document, trop peu pour qu'un
 *    lien oublié dans un historique serve à quelque chose. Les liens sont
 *    fabriqués à l'ouverture de la fiche : recharger la page les renouvelle.
 */

/** Durée de vie d'un lien de consultation, en secondes. */
export const SIGNED_URL_TTL_SECONDS = 300;

export const DOCUMENTS_BUCKET = "driver-docs";

/**
 * Colonnes ajoutées par la migration du 2026-09-29. Séparées du reste pour
 * pouvoir replier dessus : avant qu'elle ne soit jouée, elles n'existent pas.
 */
const REVIEW_COLUMNS = "checked_ok, expires_at, checked_at";
const BASE_COLUMNS =
  "id, kind, storage_path, mime_type, size_bytes, status, review_note, created_at";

export interface AdminDocument {
  id: string;
  kind: DriverDocumentKind;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  status: string;
  reviewNote: string | null;
  checkedOk: boolean;
  expiresAt: string | null;
  checkedAt: string | null;
  createdAt: string;
  /** Lien temporaire, ou `null` si la signature a échoué (fichier disparu). */
  url: string | null;
}

interface DocumentRow {
  id: string;
  kind: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  status: string;
  review_note: string | null;
  checked_ok?: boolean | null;
  expires_at?: string | null;
  checked_at?: string | null;
  created_at: string;
}

/**
 * Les pièces d'un chauffeur, chacune avec son lien de consultation.
 *
 * ⚠️ Un échec de signature ne fait pas échouer la page : la pièce s'affiche
 * avec `url: null` et l'écran dit qu'elle est illisible. Perdre l'accès à tout
 * le dossier parce qu'un fichier a disparu du bucket serait pire que de le
 * signaler.
 *
 * ⚠️ **Replie sur les colonnes de base si la migration n'est pas jouée.**
 * Sans ce repli, demander `checked_ok` à une table qui ne l'a pas renvoie une
 * erreur 400, la liste revient vide, et l'écran laisse croire qu'un chauffeur
 * n'a déposé aucune pièce — alors qu'elles sont là. Consulter les documents
 * doit marcher avant la migration ; seul l'ENREGISTREMENT du contrôle en
 * dépend. `schemaReady` dit lequel des deux cas on est.
 */
export async function listDocumentsForReview(
  driverId: string
): Promise<{ documents: AdminDocument[]; schemaReady: boolean }> {
  const db = adminDb();
  if (!db) return { documents: [], schemaReady: false };

  const query = (columns: string) =>
    db
      .from("driver_documents")
      .select(columns)
      .eq("driver_id", driverId)
      .order("created_at", { ascending: true });

  let schemaReady = true;
  let { data, error } = await query(`${BASE_COLUMNS}, ${REVIEW_COLUMNS}`);

  if (error) {
    // 42703 = colonne inexistante : la migration n'est pas passée.
    schemaReady = false;
    console.warn(
      `[admin-docs] colonnes de contrôle absentes (${error.message}) — lecture en mode consultation seule`
    );
    ({ data, error } = await query(BASE_COLUMNS));
  }

  if (error || !data) {
    console.error(`[admin-docs] lecture impossible : ${error?.message}`);
    return { documents: [], schemaReady };
  }

  const rows = data as unknown as DocumentRow[];

  const documents = await Promise.all(
    rows.map(async (row) => {
      const { data: signed } = await db.storage
        .from(DOCUMENTS_BUCKET)
        .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);

      return {
        id: row.id,
        kind: row.kind as DriverDocumentKind,
        storagePath: row.storage_path,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        status: row.status,
        reviewNote: row.review_note,
        checkedOk: row.checked_ok === true,
        expiresAt: row.expires_at ?? null,
        checkedAt: row.checked_at ?? null,
        createdAt: row.created_at,
        url: signed?.signedUrl ?? null,
      };
    })
  );

  return { documents, schemaReady };
}

/**
 * Journalise une action d'administration dans `audit_log`.
 *
 * ⚠️ `user_id` porte l'ADMINISTRATEUR qui agit, jamais le chauffeur concerné —
 * celui-ci est dans `detail.driver_id`. C'est la question à laquelle ce journal
 * doit répondre en cas de litige : *qui* a validé, *quand*, et *sur quelles
 * pièces*. L'inverse ne répondrait à rien.
 *
 * Un échec d'écriture est journalisé sans interrompre l'action : refuser une
 * validation parce que la trace n'a pas pu s'écrire punirait le chauffeur d'un
 * incident de base.
 */
export async function logAdminAction(
  adminId: string,
  action: string,
  detail: Record<string, unknown>
): Promise<void> {
  const db = adminDb();
  if (!db) return;
  const { error } = await db
    .from("audit_log")
    .insert({ user_id: adminId, action, detail });
  if (error) {
    console.error(`[admin-docs] trace « ${action} » non écrite : ${error.message}`);
  }
}
