import { describe, it, expect } from "vitest";
import {
  PLATFORM_COMMISSION_RATE,
  PRICE_BANDS,
  bandFor,
  boundsFor,
  clampRate,
  commissionOn,
  driverNetOn,
  isRateInBand,
  isRateEditable,
  hasFixedPricing,
  rateError,
  splitRate,
} from "@/lib/pricing";
import { FIXTURE_DRIVERS as drivers } from "./fixtures/drivers";

describe("pricing — bandes tarifaires par gamme", () => {
  it("impose un prix unique à Business, Moto et Van", () => {
    for (const c of ["Business", "Moto", "Van"] as const) {
      expect(boundsFor(c, "hour"), c).toEqual({ min: 120, max: 120 });
      expect(boundsFor(c, "day"), c).toEqual({ min: 1000, max: 1000 });
      expect(hasFixedPricing(c), c).toBe(true);
      expect(isRateEditable(c, "hour"), c).toBe(false);
      expect(isRateEditable(c, "day"), c).toBe(false);
    }
  });

  it("laisse les gammes premium libres dans leurs bornes", () => {
    for (const c of ["Luxury", "Van Luxury"] as const) {
      expect(hasFixedPricing(c), c).toBe(false);
      expect(isRateEditable(c, "hour"), c).toBe(true);
      expect(isRateEditable(c, "day"), c).toBe(true);
    }
  });

  it("ramène toute saisie d'une gamme fixe au prix imposé", () => {
    expect(clampRate("Business", "hour", 500)).toBe(120);
    expect(clampRate("Van", "hour", 10)).toBe(120);
    expect(clampRate("Moto", "day", 9999)).toBe(1000);
  });

  it("dit « imposé » plutôt que « fourchette » sur une gamme fixe", () => {
    expect(rateError("Business", "hour", 300)).toContain("imposé");
    expect(rateError("Business", "hour", 300)).toContain("120 €");
    expect(rateError("Business", "hour", 120)).toBeNull();
  });

  it("applique la bande premium à Luxury et Van Luxury", () => {
    for (const c of ["Luxury", "Van Luxury"] as const) {
      expect(boundsFor(c, "hour"), c).toEqual({ min: 150, max: 250 });
      expect(boundsFor(c, "day"), c).toEqual({ min: 1500, max: 3000 });
    }
  });

  it("retombe sur la bande standard pour une gamme inconnue", () => {
    expect(bandFor(undefined)).toEqual(PRICE_BANDS.Business);
  });

  it("accepte les bornes, refuse ce qui dépasse", () => {
    expect(isRateInBand("Luxury", "hour", 150)).toBe(true);
    expect(isRateInBand("Luxury", "hour", 250)).toBe(true);
    expect(isRateInBand("Luxury", "hour", 149)).toBe(false);
    expect(isRateInBand("Luxury", "hour", 251)).toBe(false);
    expect(isRateInBand("Business", "hour", 120)).toBe(true);
    expect(isRateInBand("Business", "hour", 119)).toBe(false);
    expect(isRateInBand("Business", "hour", 121)).toBe(false);
  });

  it("refuse une saisie non numérique", () => {
    expect(isRateInBand("Business", "hour", NaN)).toBe(false);
    expect(rateError("Business", "hour", NaN)).toBe("Indiquez un tarif.");
    expect(rateError("Business", "hour", 0)).toBe("Indiquez un tarif.");
  });

  it("nomme la fourchette dans le message d'erreur", () => {
    expect(rateError("Luxury", "hour", 300)).toContain("150 € à 250 €");
    expect(rateError("Luxury", "day", 900)).toContain("1500 € à 3000 €");
    expect(rateError("Luxury", "hour", 200)).toBeNull();
  });
});

describe("pricing — clamp (dernier rempart côté serveur)", () => {
  it("ramène une valeur hors bande dans la bande", () => {
    expect(clampRate("Luxury", "hour", 900)).toBe(250);
    expect(clampRate("Luxury", "hour", 10)).toBe(150);
    expect(clampRate("Business", "day", 5)).toBe(1000);
  });

  it("laisse une valeur valide intacte", () => {
    expect(clampRate("Luxury", "hour", 200)).toBe(200);
  });

  it("retombe sur le minimum pour une saisie absurde", () => {
    expect(clampRate("Business", "hour", NaN)).toBe(120);
    expect(clampRate("Business", "hour", -50)).toBe(120);
  });
});

describe("pricing — commission plateforme (25 %)", () => {
  it("prélève la commission SUR le prix client, sans le gonfler", () => {
    const s = splitRate(200);
    expect(s.ttc).toBe(200); // le client paie le prix affiché
    expect(s.commission).toBe(50);
    expect(s.net).toBe(150);
  });

  it("garantit commission + net = prix client, même sur un montant impair", () => {
    for (const ttc of [120, 149, 170, 233, 999, 1501]) {
      const s = splitRate(ttc);
      expect(s.commission + s.net, String(ttc)).toBe(s.ttc);
    }
  });

  it("expose le taux et les raccourcis", () => {
    expect(PLATFORM_COMMISSION_RATE).toBe(0.25);
    expect(commissionOn(1000)).toBe(250);
    expect(driverNetOn(1000)).toBe(750);
  });

  it("neutralise un montant absent ou négatif", () => {
    expect(splitRate(0)).toEqual({ ttc: 0, commission: 0, net: 0 });
    expect(splitRate(-100).net).toBe(0);
  });
});

describe("pricing — cohérence des tarifs chauffeur", () => {
  it("place chaque tarif dans la bande de sa gamme", () => {
    for (const d of drivers) {
      const c = d.categories[0];
      expect(isRateInBand(c, "hour", d.pricePerHour), `${d.id} horaire`).toBe(true);
      expect(isRateInBand(c, "day", d.pricePerDay), `${d.id} journalier`).toBe(true);
    }
  });

  it("n'est donc jamais modifié par le clamp serveur", () => {
    for (const d of drivers) {
      const c = d.categories[0];
      expect(clampRate(c, "hour", d.pricePerHour), d.id).toBe(d.pricePerHour);
      expect(clampRate(c, "day", d.pricePerDay), d.id).toBe(d.pricePerDay);
    }
  });
});
