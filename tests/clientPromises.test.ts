import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatPrice } from "@/lib/utils";
import { dictionaries } from "@/lib/dictionaries";

/**
 * Ce que le site promet au client (test UX du 2026-10-14).
 *
 * Chaque phrase interdite ci-dessous a été publiée, et chacune était fausse
 * pour un annuaire : un compte « pour accéder à l'annuaire » qui est en libre
 * accès, des « trajets » qu'aucun compte ne garde, une vérification « avant
 * toute mise en relation » que la fiche contredisait, un NDA que personne ne
 * signe, un temps de réponse inventé.
 */

describe("format des prix", () => {
  it("écrit « 65 € » à la française, avec une espace insécable", () => {
    expect(formatPrice(65)).toBe("65 €");
    expect(formatPrice(535.5)).toBe("535,50 €");
  });
});

describe("promesses de la page d'accueil", () => {
  const FORBIDDEN = [
    /NDA/,
    /retrouver vos trajets|find your trips/i,
    /pour accéder à l'annuaire|to browse the directory, or/i,
    /avant toute mise en relation|before any introduction/i,
    /5 minutes/,
  ];

  it("ne contient plus aucune promesse intenable", () => {
    for (const lang of ["fr", "en"] as const) {
      const text = JSON.stringify({ hero: dictionaries[lang].hero, home: dictionaries[lang].home });
      for (const re of FORBIDDEN) expect(text, `${lang} : ${re}`).not.toMatch(re);
    }
  });

  it("dit dès le hero que c'est un annuaire gratuit, sans commission", () => {
    expect(dictionaries.fr.hero.pitch).toMatch(/Annuaire/);
    expect(dictionaries.fr.hero.pitch).toMatch(/sans commission/);
    expect(dictionaries.en.hero.pitch).toMatch(/no commission/);
    // Le contact passe par Nova : seul le règlement est direct.
    expect(dictionaries.fr.hero.pitch).not.toMatch(/contactez[^.]*en direct/i);
  });
});

describe("fiche chauffeur", () => {
  it("n'invente pas de temps de réponse par défaut", () => {
    const src = readFileSync(resolve(__dirname, "../lib/driverDirectory.ts"), "utf8");
    // Ni valeur de repli dans le code, ni reprise du défaut de la colonne
    // (« ≈ 5 min » en base, qu'aucun chauffeur n'a jamais saisi).
    expect(src).not.toMatch(/response_time \?\? "/);
    expect(src).toContain("responseTime: declaredResponseTime(row.response_time)");
    const schema = readFileSync(resolve(__dirname, "../supabase/schema.sql"), "utf8");
    expect(schema).not.toMatch(/response_time\s+text\s+default/);
  });
});
