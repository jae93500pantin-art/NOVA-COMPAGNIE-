import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  QUOTE_HONEYPOT_FIELD,
  QUOTE_LIMITS,
  isHoneypotFilled,
  QUOTE_RETENTION_MONTHS,
  isQuoteExpired,
  quoteRetentionCutoff,
  normalizeQuote,
  quoteDetailsForStorage,
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

  it("n'exige PAS de compte, et la date reste un texte libre facultatif", () => {
    // Pas d'identifiant de session : exiger un compte écarterait les
    // visiteurs. La date souhaitée (2026-10-14) est du TEXTE, jamais exigée :
    // un créneau obligatoire ou parsé se lirait comme une réservation.
    const keys = Object.keys(draft({ details: "" })).sort();
    expect(keys).toEqual(["details", "email", "name", "phone", "trip"]);
    expect(quoteError(draft({ when: "" }))).toBeNull();
    expect(normalizeQuote(draft({ when: "  vendredi vers 7 h " })).when).toBe("vendredi vers 7 h");
  });

  it("écrit la date souhaitée en tête des précisions enregistrées", () => {
    expect(quoteDetailsForStorage({ when: "vendredi 7 h", details: "2 valises" })).toBe(
      "Date et heure souhaitées : vendredi 7 h\n\n2 valises"
    );
    expect(quoteDetailsForStorage({ when: "", details: "2 valises" })).toBe("2 valises");
    expect(quoteDetailsForStorage({})).toBeNull();
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

describe("conservation des demandes", () => {
  const now = new Date("2026-10-13T12:00:00+02:00");

  it("dure douze mois", () => {
    expect(QUOTE_RETENTION_MONTHS).toBe(12);
    expect(quoteRetentionCutoff(now).getFullYear()).toBe(2025);
    expect(quoteRetentionCutoff(now).getMonth()).toBe(9);
  });

  it("garde une demande de moins d'un an", () => {
    expect(isQuoteExpired("2026-01-01T00:00:00Z", now)).toBe(false);
    expect(isQuoteExpired("2025-10-14T00:00:00Z", now)).toBe(false);
  });

  it("expire une demande de plus d'un an", () => {
    expect(isQuoteExpired("2025-10-01T00:00:00Z", now)).toBe(true);
  });

  it("n'expire pas une date illisible", () => {
    // Supprimer une demande sur une date qu'on ne sait pas lire serait
    // une perte de données décidée par un bug.
    expect(isQuoteExpired("pas une date", now)).toBe(false);
  });

  it("la politique de confidentialité annonce cette durée", () => {
    const src = readFileSync(
      resolve(__dirname, "..", "app", "(site)", "legal", "confidentialite", "page.tsx"),
      "utf8"
    );
    expect(src).toContain("{QUOTE_RETENTION_MONTHS} mois");
  });

  it("le formulaire informe le visiteur au moment de la collecte", () => {
    // art. 13 RGPD : le visiteur n'a pas de compte, c'est sa seule occasion.
    const src = readFileSync(
      resolve(__dirname, "..", "components", "QuoteRequestForm.tsx"),
      "utf8"
    );
    expect(src).toContain("{QUOTE_RETENTION_MONTHS}");
    expect(src).toContain("/legal/confidentialite");
  });
});

describe("champ piège (antispam)", () => {
  it("vide ou absent : un humain", () => {
    expect(isHoneypotFilled("")).toBe(false);
    expect(isHoneypotFilled("   ")).toBe(false);
    expect(isHoneypotFilled(undefined)).toBe(false);
    expect(isHoneypotFilled(null)).toBe(false);
  });

  it("rempli : un robot", () => {
    expect(isHoneypotFilled("http://spam.example")).toBe(true);
  });

  it("ne porte pas un nom que le navigateur préremplit", () => {
    // Sinon l'autoremplissage d'un vrai visiteur ferait perdre sa demande.
    expect(QUOTE_HONEYPOT_FIELD).not.toMatch(/web|site|url|company|org|fax|name|mail|phone|tel|address/i);
  });

  it("la route l'examine avant toute écriture", () => {
    const src = readFileSync(resolve(__dirname, "..", "app", "api", "quotes", "route.ts"), "utf8");
    const trap = src.indexOf("isHoneypotFilled(");
    expect(trap).toBeGreaterThan(-1);
    expect(trap).toBeLessThan(src.indexOf(".insert("));
  });
});
