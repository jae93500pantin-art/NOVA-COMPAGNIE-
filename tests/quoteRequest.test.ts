import { describe, it, expect } from "vitest";
import {
  QUOTE_LIMITS,
  normalizeQuote,
  quoteError,
  type QuoteDraft,
} from "@/lib/quoteRequest";

const draft = (over: Partial<QuoteDraft> = {}): QuoteDraft => ({
  name: "Claire Moreau",
  email: "claire@example.com",
  phone: "06 12 34 56 78",
  trip: "Orly → Paris 8e",
  ...over,
});

describe("quoteError", () => {
  it("accepte une demande complète", () => {
    expect(quoteError(draft())).toBeNull();
  });

  it("exige un nom d'au moins deux caractères, espaces exclus", () => {
    expect(quoteError(draft({ name: "" }))).toBe("name");
    expect(quoteError(draft({ name: "  " }))).toBe("name");
    expect(quoteError(draft({ name: "A" }))).toBe("name");
    expect(quoteError(draft({ name: "Li" }))).toBeNull();
  });

  it("refuse une adresse e-mail invalide", () => {
    for (const email of ["", "claire", "claire@", "@example.com", "a@b", "a b@c.fr"]) {
      expect(quoteError(draft({ email }))).toBe("email");
    }
  });

  it("accepte les formes de téléphone réellement employées", () => {
    // ⚠️ Volontairement permissif : un visiteur qui veut un devis n'a aucune
    // raison d'être recalé par un validateur zélé.
    for (const phone of [
      "0612345678",
      "06 12 34 56 78",
      "06.12.34.56.78",
      "+33 6 12 34 56 78",
      "+33 (0)6 12 34 56 78",
      "+44 20 7946 0958",
    ]) {
      expect(quoteError(draft({ phone }))).toBeNull();
    }
  });

  it("refuse un numéro qui ne permet pas de rappeler", () => {
    for (const phone of ["", "06", "12345678", "appelez-moi"]) {
      expect(quoteError(draft({ phone }))).toBe("phone");
    }
  });

  it("exige un trajet", () => {
    expect(quoteError(draft({ trip: "" }))).toBe("trip");
    expect(quoteError(draft({ trip: "  " }))).toBe("trip");
    expect(quoteError(draft({ trip: "CDG" }))).toBeNull();
  });

  it("signale le PREMIER champ fautif, dans l'ordre du formulaire", () => {
    // Un formulaire qui pointe un champ situé plus bas que le premier vide
    // fait remonter le visiteur à l'aveugle.
    expect(quoteError(draft({ name: "", email: "x", phone: "", trip: "" }))).toBe(
      "name"
    );
  });

  it("n'exige PAS de compte ni de date", () => {
    // Le brouillon ne porte ni identifiant de session ni créneau : exiger un
    // compte écarterait les visiteurs, et un créneau se lirait comme une
    // réservation.
    const keys = Object.keys(draft({ details: "" })).sort();
    expect(keys).toEqual(["details", "email", "name", "phone", "trip"]);
  });
});

describe("normalizeQuote", () => {
  it("nettoie et abaisse la casse de l'adresse", () => {
    const q = normalizeQuote(
      draft({ name: "  Claire  ", email: "  Claire@EXAMPLE.COM " })
    );
    expect(q.name).toBe("Claire");
    expect(q.email).toBe("claire@example.com");
  });

  it("tronque au lieu de refuser", () => {
    // ⚠️ Perdre la demande d'un client parce qu'un champ dépasse serait pire
    // que de l'enregistrer raccourcie. Les bornes BASSES, elles, sont refusées.
    const q = normalizeQuote(draft({ trip: "x".repeat(QUOTE_LIMITS.trip + 50) }));
    expect(q.trip).toHaveLength(QUOTE_LIMITS.trip);
  });

  it("rend une chaîne vide pour des précisions absentes", () => {
    // La colonne est nullable, mais le module ne doit pas rendre `undefined` :
    // l'appelant le passerait tel quel à l'insertion.
    expect(normalizeQuote(draft()).details).toBe("");
  });

  it("ne fabrique aucun montant", () => {
    // ⚠️ Un prix calculé par Nova serait un prix imposé au chauffeur (règle 3
    // du statut d'annuaire). Ce test échoue si une colonne de prix apparaît.
    const q = normalizeQuote(draft()) as Record<string, unknown>;
    for (const forbidden of ["price", "amount", "total", "quote", "fare"]) {
      expect(q[forbidden]).toBeUndefined();
    }
  });
});
