import { describe, it, expect } from "vitest";
import {
  CNAPS_DOCUMENT_KIND,
  cnapsCardState,
  hasVerifiedCnapsCard,
} from "@/lib/cnaps";
import {
  DOCUMENT_KINDS,
  DOCUMENT_LABELS,
  documentsToCollect,
  missingRequired,
} from "@/lib/driverDocuments";

describe("hasVerifiedCnapsCard — le badge ne s'affiche que sur examen", () => {
  it("exige la verification, pas la declaration", () => {
    expect(hasVerifiedCnapsCard({ cnapsVerified: true })).toBe(true);
    expect(hasVerifiedCnapsCard({ cnapsVerified: false })).toBe(false);
    expect(hasVerifiedCnapsCard({})).toBe(false);
  });
});

describe("cnapsCardState — suivi du dossier, cote chauffeur", () => {
  it("distingue les quatre etats", () => {
    expect(cnapsCardState(null)).toBe("missing");
    expect(cnapsCardState(undefined)).toBe("missing");
    expect(cnapsCardState({ status: "approved" })).toBe("verified");
    expect(cnapsCardState({ status: "rejected" })).toBe("rejected");
    expect(cnapsCardState({ status: "pending" })).toBe("pending");
  });

  it("traite un statut inconnu comme « en attente », jamais comme verifie", () => {
    // Une base plus recente que le code ne doit pas produire un badge.
    expect(cnapsCardState({ status: "under_review" })).toBe("pending");
    expect(cnapsCardState({ status: null })).toBe("pending");
    expect(cnapsCardState({})).toBe("pending");
  });
});

describe("la carte CNAPS reste facultative", () => {
  it("n'est jamais reclamee pour completer un dossier", () => {
    // ⚠️ Le jour ou elle redevient obligatoire, c'est qu'une seconde
    // prestation est reapparue — ce que la plateforme n'a pas le droit de
    // vendre sans autorisation d'exercer (art. L612-2 CSI).
    expect(missingRequired([])).not.toContain(CNAPS_DOCUMENT_KIND);
    expect(DOCUMENT_LABELS[CNAPS_DOCUMENT_KIND].required).toBe(false);
  });

  it("est toujours proposee au depot", () => {
    // Elle valorise le profil : la cacher reviendrait a la refuser.
    expect(documentsToCollect()).toContain(CNAPS_DOCUMENT_KIND);
  });

  it("n'exige aucune piece conditionnellement", () => {
    // Le drapeau `requiredForSecurity` portait l'axe de prestation retire :
    // aucune piece ne doit redevenir obligatoire selon un metier declare.
    for (const kind of DOCUMENT_KINDS) {
      expect(Object.keys(DOCUMENT_LABELS[kind])).toEqual([
        "label",
        "hint",
        "required",
      ]);
    }
  });

  it("laisse le dossier complet sans elle", () => {
    const required = DOCUMENT_KINDS.filter(
      (k) => DOCUMENT_LABELS[k].required
    ).map((kind) => ({ kind }));
    expect(missingRequired(required)).toEqual([]);
  });
});
