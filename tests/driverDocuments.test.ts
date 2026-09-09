import { describe, it, expect } from "vitest";
import {
  DOCUMENT_KINDS,
  DOCUMENT_LABELS,
  MAX_DOCUMENT_BYTES,
  documentError,
  documentPath,
  missingRequired,
} from "@/lib/driverDocuments";

describe("documentPath", () => {
  it("range la pièce sous le compte de son propriétaire", () => {
    expect(documentPath("uuid-1", "licence", "image/jpeg")).toBe(
      "uuid-1/licence.jpg"
    );
  });

  it("n'utilise jamais le nom de fichier envoyé", () => {
    /**
     * Le chemin ne dépend QUE du compte, du type de pièce et du type MIME.
     * Un nom contrôlé par l'appelant permettrait de remonter l'arborescence
     * (« ../ ») ou d'écraser la pièce d'un autre chauffeur : la signature
     * n'accepte donc pas de nom du tout.
     */
    const path = documentPath("uuid-1", "vtc_card", "application/pdf");
    expect(path).toBe("uuid-1/vtc_card.pdf");
    expect(path).not.toContain("..");
    expect(path.split("/")).toHaveLength(2);
  });

  it("borne l'extension aux types connus", () => {
    // Un type MIME inattendu ne doit pas devenir une extension arbitraire.
    expect(documentPath("u", "identity", "application/x-msdownload")).toBe(
      "u/identity.bin"
    );
  });

  it("écrit toujours au même endroit pour un type donné", () => {
    // Redéposer remplace : c'est ce qui évite d'empiler des versions dont
    // personne ne sait laquelle fait foi.
    expect(documentPath("u", "licence", "image/png")).toBe(
      documentPath("u", "licence", "image/png")
    );
  });
});

describe("documentError", () => {
  it("accepte les formats prévus", () => {
    expect(documentError({ size: 1024, type: "image/jpeg" })).toBeNull();
    expect(documentError({ size: 1024, type: "application/pdf" })).toBeNull();
  });

  it("refuse un fichier vide", () => {
    expect(documentError({ size: 0, type: "image/png" })).toBeTruthy();
  });

  it("refuse au-delà de la limite, pile à la limite passe", () => {
    expect(documentError({ size: MAX_DOCUMENT_BYTES, type: "image/png" })).toBeNull();
    expect(
      documentError({ size: MAX_DOCUMENT_BYTES + 1, type: "image/png" })
    ).toBeTruthy();
  });

  it("refuse un exécutable déguisé", () => {
    expect(
      documentError({ size: 1024, type: "application/x-msdownload" })
    ).toBeTruthy();
    expect(documentError({ size: 1024, type: "text/html" })).toBeTruthy();
  });
});

describe("missingRequired", () => {
  it("liste ce qu'il manque pour que le dossier soit examinable", () => {
    expect(missingRequired([])).toEqual([
      "licence",
      "vtc_card",
      "insurance",
      "registration",
    ]);
  });

  it("ne réclame pas la pièce d'identité, facultative", () => {
    expect(missingRequired([])).not.toContain("identity");
  });

  it("est vide quand tout l'obligatoire est là", () => {
    const all = DOCUMENT_KINDS.filter((k) => DOCUMENT_LABELS[k].required).map(
      (kind) => ({ kind })
    );
    expect(missingRequired(all)).toEqual([]);
  });

  it("ignore une pièce inconnue plutôt que de la compter", () => {
    expect(missingRequired([{ kind: "selfie" }])).toHaveLength(4);
  });
});

describe("catalogue des pièces", () => {
  it("décrit chaque type, sans exception", () => {
    for (const kind of DOCUMENT_KINDS) {
      expect(DOCUMENT_LABELS[kind]?.label, kind).toBeTruthy();
      expect(DOCUMENT_LABELS[kind]?.hint, kind).toBeTruthy();
    }
  });

  it("exige la carte VTC — sans elle l'exercice est illégal", () => {
    expect(DOCUMENT_LABELS.vtc_card.required).toBe(true);
    expect(DOCUMENT_LABELS.licence.required).toBe(true);
  });
});
