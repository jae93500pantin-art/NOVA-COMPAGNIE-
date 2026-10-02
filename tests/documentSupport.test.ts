// @vitest-environment node
//
// ⚠️ Environnement `node` et non jsdom : `lib/documentSupport.ts` importe
// `server-only`, dont la variante navigateur lève à l'import. Sous jsdom, ce
// fichier échouerait au chargement — pas sur une assertion.

import { describe, it, expect, afterEach, vi } from "vitest";

// ⚠️ Avant l'import : `lib/config` lit `process.env` au chargement du module,
// donc des clés posées plus bas arriveraient trop tard et le module se
// croirait non configuré — il rendrait `null` sans jamais appeler fetch.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemple.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-de-test";
});

import {
  isUnknownEnumError,
  supportedDocumentKinds,
  forgetDocumentKindCache,
} from "@/lib/documentSupport";

afterEach(() => {
  forgetDocumentKindCache();
  vi.unstubAllGlobals();
});

describe("isUnknownEnumError", () => {
  it("reconnaît le refus de Postgres sur une valeur d'enum", () => {
    expect(
      isUnknownEnumError(
        'invalid input value for enum driver_document_kind: "kbis"'
      )
    ).toBe(true);
  });

  it("ne confond pas avec les autres erreurs de conversion", () => {
    // ⚠️ Même code SQLSTATE (22P02) qu'un uuid mal formé. Confondre les deux
    // afficherait « pièce indisponible » pour une erreur sans rapport, et
    // masquerait un vrai bug derrière un message rassurant.
    expect(isUnknownEnumError('invalid input syntax for type uuid: "abc"')).toBe(
      false
    );
    expect(isUnknownEnumError("duplicate key value violates unique constraint")).toBe(
      false
    );
    expect(isUnknownEnumError(undefined)).toBe(false);
    expect(isUnknownEnumError("")).toBe(false);
  });
});

describe("supportedDocumentKinds", () => {
  const spec = (values: string[]) => ({
    ok: true,
    json: async () => ({
      definitions: {
        driver_documents: { properties: { kind: { enum: values } } },
      },
    }),
  });

  it("lit les valeurs réellement présentes dans l'enum", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => spec(["licence", "vtc_card", "identity"]))
    );
    const kinds = await supportedDocumentKinds();
    expect(kinds).toEqual(["licence", "vtc_card", "identity"]);
    expect(kinds).not.toContain("kbis");
  });

  it("ignore une valeur présente en base mais inconnue du code", async () => {
    // Elle n'a ni libellé ni règle : rien à en faire côté interface.
    vi.stubGlobal("fetch", vi.fn(async () => spec(["licence", "passeport_lunaire"])));
    expect(await supportedDocumentKinds()).toEqual(["licence"]);
  });

  it("rend null — « je ne sais pas » — quand la lecture échoue", async () => {
    // ⚠️ Et surtout pas une liste vide : une liste vide se lirait « aucune
    // pièce n'est acceptée » et bloquerait tous les dépôts parce qu'une
    // requête annexe a échoué.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      })
    );
    expect(await supportedDocumentKinds()).toBeNull();
  });

  it("rend null sur un schéma inattendu plutôt qu'une liste vide", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    expect(await supportedDocumentKinds()).toBeNull();
  });

  it("ne relit pas le schéma à chaque dépôt", async () => {
    const f = vi.fn(async () => spec(["licence"]));
    vi.stubGlobal("fetch", f);
    await supportedDocumentKinds();
    await supportedDocumentKinds();
    await supportedDocumentKinds();
    expect(f).toHaveBeenCalledTimes(1);
  });
});
