import { describe, it, expect } from "vitest";
import {
  CONTACT_MASK,
  hasContactDetails,
  maskContacts,
} from "@/lib/chatMasking";

const masked = (s: string) => maskContacts(s).text;

describe("maskContacts — ce qui DOIT être masqué", () => {
  it("masque un mobile français sous toutes ses écritures", () => {
    for (const n of [
      "0612345678",
      "06 12 34 56 78",
      "06.12.34.56.78",
      "06-12-34-56-78",
      "+33 6 12 34 56 78",
      "+33612345678",
      "0033612345678",
      // Notation tres repandue en France : la parenthese ne doit pas couper
      // le numero en deux et laisser « +33 (*** » a l'ecran.
      "+33 (0)6 12 34 56 78",
      "0033 (0)6 12 34 56 78",
      "(0)6.12.34.56.78",
    ]) {
      expect(masked(`appelle moi au ${n}`)).toBe(`appelle moi au ${CONTACT_MASK}`);
    }
  });

  it("masque un numéro international", () => {
    expect(masked("+1 415 555 0132")).toBe(CONTACT_MASK);
    expect(masked("+44 20 7946 0958")).toBe(CONTACT_MASK);
  });

  it("masque une adresse e-mail", () => {
    expect(masked("ecris a jean.dupont@example.com stp")).toBe(
      `ecris a ${CONTACT_MASK} stp`
    );
    expect(masked("jean+vtc@mail.co.uk")).toBe(CONTACT_MASK);
  });

  it("masque les formes obfusquées entre parentheses ou crochets", () => {
    expect(masked("jean (at) example (dot) com")).toBe(CONTACT_MASK);
    expect(masked("jean[at]example[dot]fr")).toBe(CONTACT_MASK);
  });

  it("masque plusieurs coordonnees dans un meme message", () => {
    const out = masked("06 12 34 56 78 ou a@b.fr");
    expect(out).toBe(`${CONTACT_MASK} ou ${CONTACT_MASK}`);
  });

  it("signale le masquage", () => {
    expect(maskContacts("0612345678").masked).toBe(true);
    expect(hasContactDetails("mon mail: a@b.fr")).toBe(true);
  });

  it("est idempotent : re-masquer ne change plus rien", () => {
    const once = masked("0612345678");
    expect(masked(once)).toBe(once);
  });
});

describe("maskContacts — ce qui ne DOIT PAS être masqué", () => {
  const intact = (s: string) => {
    expect(masked(s)).toBe(s);
    expect(hasContactDetails(s)).toBe(false);
  };

  it("laisse une date passer", () => {
    // Le piege principal : avec « / » comme separateur, cette phrase compte
    // dix chiffres et se ferait masquer.
    intact("je vous prends le 12/09/2026 14h30");
    intact("rendez-vous le 01/02/2026 a 07h");
  });

  it("laisse une heure et une duree passer", () => {
    intact("je suis la a 07.30, course de 3 h");
  });

  it("laisse un prix passer", () => {
    intact("le total est de 1 500 EUR");
    intact("170 EUR de l'heure, 1000 EUR la journee");
  });

  it("laisse une adresse passer", () => {
    intact("12 rue de Rivoli, 75001 Paris");
    intact("Terminal 2E, porte 8");
  });

  it("laisse un numero de vol passer", () => {
    intact("vol AF1234 a 18h05");
  });

  it("laisse une parenthese chiffree passer", () => {
    // Le risque assume en admettant « ( » et « ) » comme separateurs.
    intact("total 1 500 (dont 100 de frais)");
    intact("porte 8 (terminal 2)");
    intact("de 5 a 10 (soit 2 h) pour 300 EUR");
  });

  it("laisse un SIRET et un horodatage passer", () => {
    intact("SIRET 123 456 789 00012");
    intact("course de 3 h le 2026-09-21 a 14:30");
  });

  it("laisse un texte ordinaire passer", () => {
    intact("Bonjour, je suis en route, 5 minutes de retard.");
    intact("");
  });
});
