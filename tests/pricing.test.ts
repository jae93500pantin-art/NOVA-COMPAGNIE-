import { describe, it, expect } from "vitest";
import {
  RATE_LIMITS,
  boundsFor,
  clampRate,
  isRateAcceptable,
  rateError,
} from "@/lib/pricing";
import { FIXTURE_DRIVERS as drivers } from "./fixtures/drivers";

describe("pricing — aucun tarif imposé (statut d'annuaire)", () => {
  it("applique les mêmes garde-fous à toutes les gammes", () => {
    expect(boundsFor("hour")).toEqual(RATE_LIMITS.hour);
    expect(boundsFor("day")).toEqual(RATE_LIMITS.day);
  });

  it("laisse passer un tarif libre, quel qu'il soit", () => {
    // Les trois valeurs qu'un barème par gamme refusait : sous l'ancien
    // plancher standard, entre les deux bandes, au-dessus du plafond premium.
    for (const rate of [90, 135, 400]) {
      expect(isRateAcceptable("hour", rate), `${rate} €/h`).toBe(true);
      expect(clampRate("hour", rate), `${rate} €/h`).toBe(rate);
    }
  });

  it("refuse une saisie absurde sans la remplacer par un prix", () => {
    // ⚠️ 0, et non un plancher : inventer un tarif au nom d'un chauffeur qui
    // n'a rien annoncé est exactement ce qu'un annuaire ne fait pas.
    expect(clampRate("hour", NaN)).toBe(0);
    expect(clampRate("hour", -50)).toBe(0);
    expect(clampRate("hour", 0)).toBe(0);
    expect(isRateAcceptable("hour", NaN)).toBe(false);
    expect(isRateAcceptable("hour", 0)).toBe(false);
  });

  it("plafonne une valeur aberrante au garde-fou", () => {
    expect(clampRate("hour", 99999)).toBe(RATE_LIMITS.hour.max);
    expect(clampRate("day", 999999)).toBe(RATE_LIMITS.day.max);
  });

  it("exige un tarif dans le formulaire, sans en suggérer un", () => {
    expect(rateError("hour", NaN)).toBe("Indiquez un tarif.");
    expect(rateError("hour", 0)).toBe("Indiquez un tarif.");
    expect(rateError("hour", 180)).toBeNull();
    expect(rateError("day", 1500)).toBeNull();
  });

  it("ne dit plus jamais « imposé » ni « gamme »", () => {
    // Le message d'erreur était le seul endroit où un prix plateforme se
    // lisait en clair. S'il y revient, c'est que la bande est revenue.
    for (const m of [rateError("hour", 99999), rateError("day", 999999)]) {
      expect(m).not.toBeNull();
      expect(m).not.toContain("imposé");
      expect(m).not.toContain("gamme");
    }
  });
});

describe("pricing — cohérence des tarifs chauffeur", () => {
  it("accepte les tarifs des fixtures sans regarder leur gamme", () => {
    for (const d of drivers) {
      expect(isRateAcceptable("hour", d.pricePerHour), `${d.id} horaire`).toBe(true);
      expect(isRateAcceptable("day", d.pricePerDay), `${d.id} journalier`).toBe(true);
    }
  });

  it("n'est jamais modifié par le clamp serveur", () => {
    // Le tarif affiché est celui que le chauffeur a saisi, à l'euro près :
    // c'est toute la promesse d'un annuaire.
    for (const d of drivers) {
      expect(clampRate("hour", d.pricePerHour), d.id).toBe(d.pricePerHour);
      expect(clampRate("day", d.pricePerDay), d.id).toBe(d.pricePerDay);
    }
  });
});
