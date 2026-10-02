import "server-only";

import { env, serverEnv } from "@/lib/config";
import { DOCUMENT_KINDS, type DriverDocumentKind } from "@/lib/driverDocuments";

/**
 * Quels types de pièce la BASE accepte-t-elle réellement ?
 *
 * ## ⚠️ Le problème que ce module résout
 *
 * `DOCUMENT_KINDS` est la liste du **code**. L'enum `driver_document_kind` est
 * la liste de la **base**. Les deux divergent entre le déploiement d'un
 * nouveau type de pièce et l'application de la migration qui l'ajoute — et
 * pendant cette fenêtre, un chauffeur qui dépose la pièce en question reçoit
 * un 500 opaque : Postgres refuse une valeur d'enum inconnue, et rien dans le
 * message ne lui dit que ce n'est pas sa faute.
 *
 * C'est arrivé le 2026-10-02 : `vtc_register` et `kbis` sont devenus
 * obligatoires côté code alors que l'enum ne les connaissait pas. L'étape 3 du
 * tunnel était infranchissable, sans explication.
 *
 * ## Comment
 *
 * PostgREST publie son schéma à la racine de l'API, **valeurs d'enum
 * comprises** : `definitions.driver_documents.properties.kind.enum`. On le lit
 * plutôt que de le deviner, et on met en cache quelques secondes — assez pour
 * ne pas interroger l'API à chaque dépôt, assez peu pour qu'une migration
 * prenne effet sans redémarrer le serveur.
 *
 * ⚠️ **En cas d'échec de la lecture, on rend `null` — « je ne sais pas » — et
 * les appelants restent optimistes.** Bloquer un dépôt parce qu'une requête
 * annexe a échoué serait pire que le problème : le garde-fou de dernier
 * recours reste l'erreur d'enum attrapée explicitement dans la route.
 */

const CACHE_MS = 30_000;

let cache: { at: number; kinds: DriverDocumentKind[] | null } | null = null;

export async function supportedDocumentKinds(): Promise<
  DriverDocumentKind[] | null
> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.kinds;

  const kinds = await readEnum();
  cache = { at: Date.now(), kinds };
  return kinds;
}

/** Vide le cache — utilisé après une migration, ou par les tests. */
export function forgetDocumentKindCache(): void {
  cache = null;
}

async function readEnum(): Promise<DriverDocumentKind[] | null> {
  const key = serverEnv.supabaseServiceRoleKey;
  if (!env.supabaseUrl || !key) return null;

  try {
    const res = await fetch(`${env.supabaseUrl}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      // ⚠️ Pas de cache HTTP : c'est précisément la valeur qui change quand une
      // migration passe, et une réponse mémorisée ferait croire que non.
      cache: "no-store",
    });
    if (!res.ok) return null;

    const spec = (await res.json()) as {
      definitions?: Record<
        string,
        { properties?: Record<string, { enum?: string[] }> }
      >;
    };
    const values = spec.definitions?.driver_documents?.properties?.kind?.enum;
    if (!Array.isArray(values) || values.length === 0) return null;

    // On ne garde que ce que le code sait traiter : une valeur présente en base
    // mais inconnue du code n'a ni libellé ni règle, donc rien à en faire.
    return DOCUMENT_KINDS.filter((k) => values.includes(k));
  } catch (err) {
    console.warn(
      `[documents] types acceptés indéterminés : ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return null;
  }
}

/**
 * L'erreur Postgres d'une valeur d'enum inconnue.
 *
 * ⚠️ Reconnue sur le MESSAGE et non sur le code : PostgREST remonte `22P02`
 * (« invalid text representation ») pour tout ce qui ne se convertit pas, y
 * compris un uuid mal formé. Le code seul confondrait les deux, et le chauffeur
 * recevrait « type de pièce indisponible » pour une erreur qui n'a rien à voir.
 */
export function isUnknownEnumError(message: string | undefined): boolean {
  return /invalid input value for enum/i.test(message ?? "");
}
