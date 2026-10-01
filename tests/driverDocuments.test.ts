import { describe, it, expect } from "vitest";
import {
  DOCUMENT_KINDS,
  DOCUMENT_LABELS,
  MAX_DOCUMENT_BYTES,
  documentError,
  documentPath,
  missingRequired,
  daysUntilExpiry,
  isExpired,
  expiresSoon,
  blockingDocuments,
  canApproveDossier,
  hasExpiredRequired,
  rejectionError,
  isRejectionReason,
  REJECTION_REASONS,
  REJECTION_LABELS,
  EXPIRY_WARNING_DAYS,
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
    // ⚠️ Six pièces depuis le 2026-09-29 : le registre VTC et le Kbis se sont
    // ajoutés, parce que la page publique promet de les contrôler. La carte
    // atteste du chauffeur, le registre atteste de l'exploitant.
    expect(missingRequired([])).toEqual([
      "licence",
      "vtc_card",
      "vtc_register",
      "kbis",
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
    expect(missingRequired([{ kind: "selfie" }])).toHaveLength(6);
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

/* -------------------------------------------------------------------------- */
/*  Contrôle par un administrateur                                            */
/* -------------------------------------------------------------------------- */

/** Horloge figée : mardi 29 septembre 2026, 14:00 locales. */
const NOW = () => new Date(2026, 8, 29, 14, 0, 0).getTime();

/** Un dossier complet et contrôlé, dont chaque test dégrade une pièce. */
const fullDossier = () =>
  DOCUMENT_KINDS.filter((k) => DOCUMENT_LABELS[k].required).map((kind) => ({
    kind,
    checkedOk: true,
    expiresAt: null as string | null,
  }));

describe("échéances des pièces", () => {
  it("compte les jours restants en date locale", () => {
    expect(daysUntilExpiry({ kind: "insurance", expiresAt: "2026-10-29" }, NOW)).toBe(30);
    expect(daysUntilExpiry({ kind: "insurance", expiresAt: "2026-09-30" }, NOW)).toBe(1);
  });

  it("⚠️ le jour de l'échéance compte encore", () => {
    // Une attestation qui expire aujourd'hui couvre la journée. La compter
    // périmée ferait disparaître une fiche un jour trop tôt.
    const doc = { kind: "insurance", expiresAt: "2026-09-29" };
    expect(daysUntilExpiry(doc, NOW)).toBe(0);
    expect(isExpired(doc, NOW)).toBe(false);
    expect(expiresSoon(doc, NOW)).toBe(true);
  });

  it("⚠️ l'heure qu'il est ne change pas le verdict", () => {
    // Même date, 23h59 : comparer une date nue à un instant ferait basculer
    // l'échéance d'un jour selon l'heure.
    const late = () => new Date(2026, 8, 29, 23, 59, 59).getTime();
    expect(isExpired({ kind: "insurance", expiresAt: "2026-09-29" }, late)).toBe(false);
    expect(isExpired({ kind: "insurance", expiresAt: "2026-09-28" }, late)).toBe(true);
  });

  it("signale une échéance proche, pas une échéance lointaine", () => {
    expect(expiresSoon({ kind: "vtc_card", expiresAt: "2026-10-20" }, NOW)).toBe(true);
    expect(expiresSoon({ kind: "vtc_card", expiresAt: "2026-12-01" }, NOW)).toBe(false);
    // Déjà périmée : ce n'est plus une alerte, c'est un retrait.
    expect(expiresSoon({ kind: "vtc_card", expiresAt: "2026-09-01" }, NOW)).toBe(false);
    expect(EXPIRY_WARNING_DAYS).toBe(30);
  });

  it("ignore une pièce sans échéance ou mal formée", () => {
    expect(daysUntilExpiry({ kind: "kbis" }, NOW)).toBeNull();
    expect(daysUntilExpiry({ kind: "kbis", expiresAt: "29/09/2026" }, NOW)).toBeNull();
    expect(isExpired({ kind: "kbis", expiresAt: null }, NOW)).toBe(false);
  });
});

describe("blockingDocuments — le bouton Valider", () => {
  it("ouvre la validation sur un dossier complet et contrôlé", () => {
    expect(blockingDocuments(fullDossier(), NOW)).toEqual([]);
    expect(canApproveDossier(fullDossier(), NOW)).toBe(true);
  });

  it("⚠️ bloque une pièce DÉPOSÉE mais non contrôlée", () => {
    // Le cœur de la fonctionnalité : déposer un fichier ne prouve rien, c'est
    // le contrôle humain qui vaut validation.
    const docs = fullDossier();
    docs[0].checkedOk = false;
    expect(canApproveDossier(docs, NOW)).toBe(false);
    expect(blockingDocuments(docs, NOW)).toEqual([
      { kind: docs[0].kind, reason: "unchecked" },
    ]);
  });

  it("bloque une pièce manquante, et la nomme", () => {
    const docs = fullDossier().filter((d) => d.kind !== "insurance");
    expect(blockingDocuments(docs, NOW)).toEqual([
      { kind: "insurance", reason: "missing" },
    ]);
  });

  it("⚠️ bloque une pièce périmée, même cochée conforme", () => {
    // Cochée hier sur un document valable hier : l'échéance prime.
    const docs = fullDossier();
    docs[1].expiresAt = "2026-09-01";
    expect(blockingDocuments(docs, NOW)).toEqual([
      { kind: docs[1].kind, reason: "expired" },
    ]);
  });

  it("ne bloque jamais sur une pièce facultative", () => {
    const docs = [
      ...fullDossier(),
      { kind: "cnaps_card", checkedOk: false, expiresAt: "2020-01-01" },
      { kind: "identity", checkedOk: false, expiresAt: null },
    ];
    expect(canApproveDossier(docs, NOW)).toBe(true);
  });

  it("exige les six pièces obligatoires, registre et Kbis compris", () => {
    // ⚠️ La carte VTC atteste du chauffeur, le registre atteste de
    // l'exploitant : les deux sont exigés, et les fusionner serait une perte
    // de contrôle.
    const required = DOCUMENT_KINDS.filter((k) => DOCUMENT_LABELS[k].required);
    expect(required).toContain("vtc_card");
    expect(required).toContain("vtc_register");
    expect(required).toContain("kbis");
    expect(blockingDocuments([], NOW).map((b) => b.kind)).toEqual(required);
  });
});

describe("hasExpiredRequired — retrait automatique de l'annuaire", () => {
  it("retire une fiche dont une pièce obligatoire a expiré", () => {
    const docs = fullDossier();
    docs[2].expiresAt = "2026-09-28";
    expect(hasExpiredRequired(docs, NOW)).toBe(true);
  });

  it("⚠️ ne retire pas une fiche sur une pièce FACULTATIVE périmée", () => {
    // Une carte CNAPS expirée retire son badge, pas la fiche entière.
    const docs = [
      ...fullDossier(),
      { kind: "cnaps_card", checkedOk: true, expiresAt: "2020-01-01" },
    ];
    expect(hasExpiredRequired(docs, NOW)).toBe(false);
  });

  it("ignore un type de pièce inconnu", () => {
    expect(
      hasExpiredRequired([{ kind: "passeport_vaccinal", expiresAt: "2020-01-01" }], NOW)
    ).toBe(false);
  });
});

describe("refus d'un dossier", () => {
  it("accepte les cinq motifs, et rien d'autre", () => {
    expect(REJECTION_REASONS).toHaveLength(5);
    for (const r of REJECTION_REASONS) {
      expect(isRejectionReason(r)).toBe(true);
      expect(REJECTION_LABELS[r].length).toBeGreaterThan(3);
    }
    expect(isRejectionReason("parce que")).toBe(false);
    expect(isRejectionReason(null)).toBe(false);
  });

  it("exige un motif", () => {
    expect(rejectionError(undefined, "")).toBe("Choisissez un motif.");
    expect(rejectionError("nimporte", "un texte")).toBe("Choisissez un motif.");
  });

  it("⚠️ « Autre motif » sans explication est refusé", () => {
    // Sans texte, le chauffeur ne sait pas quoi redéposer et revient avec la
    // même pièce.
    expect(rejectionError("other", "")).toContain("Précisez");
    expect(rejectionError("other", "flou")).toContain("Précisez");
    expect(rejectionError("other", "Le nom sur le Kbis ne correspond pas.")).toBeNull();
  });

  it("accepte un motif de la liste sans texte", () => {
    expect(rejectionError("unreadable", "")).toBeNull();
    expect(rejectionError("expired", "Assurance échue au 01/09.")).toBeNull();
  });

  it("refuse un motif démesuré", () => {
    expect(rejectionError("unreadable", "x".repeat(501))).toContain("trop long");
  });
});
