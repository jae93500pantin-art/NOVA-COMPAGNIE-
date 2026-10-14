import { describe, it, expect } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  contactMessageEmail,
  documentExpiringEmail,
  driverApprovedEmail,
  driverRejectedEmail,
  quoteRequestEmail,
  supabaseAuthTemplates,
  welcomeEmail,
} from "@/lib/emailTemplates";
import { contactError, CONTACT_TYPES, CONTACT_TYPE_LABELS } from "@/lib/contactMessage";
import { ADDRESS, SIREN } from "@/lib/legalEntity";
import { dictionaries } from "@/lib/dictionaries";

const XSS = `<script>alert("x")</script>`;

const all = () => [
  driverApprovedEmail({ firstName: "Léa", loginUrl: "https://www.novacompagnie.com/auth/login" }),
  driverRejectedEmail({
    firstName: "Léa",
    reasonLabel: "Pièce illisible",
    note: "Le permis est flou",
    resumeUrl: "https://www.novacompagnie.com/compte/onboarding",
  }),
  documentExpiringEmail({
    firstName: "Léa",
    documentLabel: "Assurance",
    expiresAt: "12/11/2026",
    daysLeft: 30,
    resumeUrl: "https://www.novacompagnie.com/compte/onboarding",
  }),
  quoteRequestEmail({
    driverName: "Léa Martin",
    driverSlug: "lea-martin",
    name: "Paul",
    email: "paul@example.com",
    phone: "0600000000",
    trip: "Paris → CDG",
  }),
  contactMessageEmail({
    name: "Paul Durand",
    email: "paul@example.com",
    phone: "",
    typeLabel: "Autre",
    message: "Bonjour",
    saved: true,
  }),
  welcomeEmail({ firstName: "Paul", role: "client", origin: "https://www.novacompagnie.com" }),
  welcomeEmail({ firstName: "Léa", role: "driver", origin: "https://www.novacompagnie.com" }),
];

describe("gabarit d'e-mail", () => {
  it("porte le style sombre, le logo et le pied de page légal sur chaque modèle", () => {
    for (const m of all()) {
      expect(m.html).toContain("#0B0F17");
      expect(m.html).toContain("#111827");
      expect(m.html).toContain("NOVA");
      expect(m.html).toContain("entrepreneur individuel (EI)");
      expect(m.html).toContain(SIREN.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3"));
      expect(m.text).toContain("n'encaisse aucune course");
      expect(m.text).toContain("NOVA COMPAGNIE");
      expect(m.subject.length).toBeGreaterThan(0);
    }
  });

  it("n'affiche aucun montant (statut d'annuaire)", () => {
    for (const m of all()) expect(m.html).not.toMatch(/\d\s?€|EUR\b/);
  });

  it("échappe les saisies publiques (devis, contact)", () => {
    const quote = quoteRequestEmail({
      driverName: "Léa",
      driverSlug: "lea",
      name: XSS,
      email: "a@b.co",
      phone: "1",
      trip: XSS,
      details: XSS,
    });
    const contact = contactMessageEmail({
      name: XSS,
      email: "a@b.co",
      phone: "",
      typeLabel: "Autre",
      message: XSS,
      saved: false,
    });
    for (const m of [quote, contact]) {
      expect(m.html).not.toContain("<script>");
      expect(m.html).toContain("&lt;script&gt;");
    }
  });

  it("refuse un lien qui n'est ni https ni mailto", () => {
    const m = driverApprovedEmail({ firstName: "x", loginUrl: "javascript:alert(1)" });
    expect(m.html).not.toContain("javascript:");
  });

  it("met le client en adresse de réponse sur les notifications internes", () => {
    const [, , , quote, contact] = all();
    expect(quote.replyTo).toBe("paul@example.com");
    expect(contact.replyTo).toBe("paul@example.com");
  });

  it("oriente un chauffeur vers son dossier, un client vers l'annuaire", () => {
    const [, , , , , client, driver] = all();
    expect(client.html).toContain("/drivers");
    expect(driver.html).toContain("/compte/onboarding");
  });
});

describe("formulaire de contact", () => {
  const ok = {
    firstName: "Paul",
    lastName: "Durand",
    email: "paul@example.com",
    phone: "",
    type: "typeOther",
    message: "Bonjour",
  };

  it("accepte une demande complète, téléphone facultatif", () => {
    expect(contactError(ok)).toBeNull();
  });

  it("refuse un champ manquant, un type inconnu ou une adresse invalide", () => {
    expect(contactError({ ...ok, message: "  " })).toBe("contact.errorRequired");
    expect(contactError({ ...ok, type: "pirate" })).toBe("contact.errorRequired");
    expect(contactError({ ...ok, email: "paul" })).toBe("contact.errorEmail");
  });

  it("ne propose plus de type « Réservation » (statut d'annuaire)", () => {
    expect(CONTACT_TYPES as readonly string[]).not.toContain("typeReservation");
    for (const label of Object.values(CONTACT_TYPE_LABELS)) {
      expect(label.toLowerCase()).not.toContain("réservation");
    }
  });

  it("ne promet aucune disponibilité continue, et affiche l'adresse légale", () => {
    for (const lang of ["fr", "en"] as const) {
      const c = dictionaries[lang].contact;
      expect(JSON.stringify(c)).not.toMatch(/24\s?h?\s?\/\s?24|24\/7|7j\/7|24 heures|24 hours|Champs/);
      expect(c.infoAddress).toBe(ADDRESS);
      for (const t of CONTACT_TYPES) expect(c[t]).toBeTruthy();
    }
  });

  it("a un libellé pour chaque type", () => {
    for (const t of CONTACT_TYPES) expect(CONTACT_TYPE_LABELS[t]).toBeTruthy();
  });
});

describe("modèles Supabase", () => {
  const dir = resolve(__dirname, "../supabase/email-templates");

  it("gardent la variable de lien Supabase intacte", () => {
    for (const t of supabaseAuthTemplates()) {
      expect(t.html).toContain('href="{{ .ConfirmationURL }}"');
    }
  });

  /**
   * Les fichiers à coller dans le dashboard sont produits par le gabarit :
   * `UPDATE_EMAIL_TEMPLATES=1 npm test` les régénère, et ce test échoue s'ils
   * ont divergé — un modèle retouché à la main dans le dépôt ne survit pas.
   */
  it("correspondent aux fichiers de supabase/email-templates", () => {
    for (const t of supabaseAuthTemplates()) {
      const path = resolve(dir, t.file);
      if (process.env.UPDATE_EMAIL_TEMPLATES === "1") {
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(path, t.html);
      }
      expect(readFileSync(path, "utf8").replace(/\r\n/g, "\n")).toBe(t.html);
    }
  });
});
