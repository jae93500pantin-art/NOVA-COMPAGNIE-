import { describe, it, expect } from "vitest";
import {
  PLATFORM_COMMISSION_RATE,
  PRICE_BANDS,
  bandFor,
  boundsFor,
  clampRate,
  CLIENT_SERVICE_FEE_RATE,
  breakdownFromClientTotal,
  clientTotalOn,
  commissionOn,
  driverNetOn,
  priceBreakdown,
  isRateInBand,
  isRateEditable,
  hasFixedPricing,
  rateError,
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

describe("pricing — barème (5 % client, 15 % chauffeur)", () => {
  it("applique les deux taux au prix du chauffeur", () => {
    const s = priceBreakdown(200);
    expect(s.driverPrice).toBe(200);
    expect(s.clientFee).toBe(10); // + 5 %
    expect(s.clientTotal).toBe(210);
    expect(s.commission).toBe(30); // − 15 %
    expect(s.driverNet).toBe(170);
    expect(s.platformMargin).toBe(40); // 10 + 30
  });

  it("suit exactement les formules du barème", () => {
    for (const p of [120, 149, 170, 233, 999, 1501, 3000]) {
      const s = priceBreakdown(p);
      expect(s.clientTotal, `total ${p}`).toBe(Math.round(p * 1.05 * 100) / 100);
      expect(s.commission, `commission ${p}`).toBe(
        Math.round(p * 0.15 * 100) / 100
      );
      expect(s.clientFee, `frais ${p}`).toBe(Math.round(p * 0.05 * 100) / 100);
      expect(s.driverNet, `net ${p}`).toBe(p - s.commission);
      expect(s.platformMargin, `marge ${p}`).toBe(s.clientFee + s.commission);
    }
  });

  it("garde chaque décomposition cohérente avec elle-même", () => {
    // Une facture doit valoir la somme de ses lignes, et le décompte du
    // chauffeur retomber exactement sur son prix : c'est le seul invariant qui
    // empêche un centime de se perdre entre l'affichage et l'encaissement.
    for (const p of [95, 120, 149.5, 170, 233, 999, 1501] ) {
      const s = priceBreakdown(p);
      expect(s.driverPrice + s.clientFee, String(p)).toBeCloseTo(s.clientTotal, 10);
      expect(s.commission + s.driverNet, String(p)).toBeCloseTo(s.driverPrice, 10);
    }
  });

  it("ne mélange jamais les deux bases de calcul", () => {
    // La commission porte sur le prix chauffeur, PAS sur le total client :
    // 15 % de 210 ferait 31,50 € et mangerait des frais que le chauffeur
    // n'encaisse pas.
    const s = priceBreakdown(200);
    expect(s.commission).not.toBe(Math.round(s.clientTotal * 0.15 * 100) / 100);
    expect(s.commission).toBe(30);
  });

  it("descend au centime quand le taux tombe sur une demie", () => {
    const s = priceBreakdown(170); // 5 % = 8,50 € — un arrondi à l'euro mentirait
    expect(s.clientFee).toBe(8.5);
    expect(s.clientTotal).toBe(178.5);
    expect(s.commission).toBe(25.5);
    expect(s.driverNet).toBe(144.5);
  });

  it("expose les taux et les raccourcis", () => {
    expect(PLATFORM_COMMISSION_RATE).toBe(0.15);
    expect(CLIENT_SERVICE_FEE_RATE).toBe(0.05);
    expect(commissionOn(1000)).toBe(150);
    expect(driverNetOn(1000)).toBe(850);
    expect(clientTotalOn(1000)).toBe(1050);
  });

  it("neutralise un montant absent ou négatif", () => {
    expect(priceBreakdown(0).clientTotal).toBe(0);
    expect(priceBreakdown(-100).driverNet).toBe(0);
    expect(priceBreakdown(Number.NaN).commission).toBe(0);
  });
});

describe("pricing — décomposition depuis le total client", () => {
  it("retrouve le prix chauffeur à partir du total facturé", () => {
    for (const p of [120, 170, 200, 999, 1000, 1500]) {
      const forward = priceBreakdown(p);
      const back = breakdownFromClientTotal(forward.clientTotal);
      expect(back.driverPrice, String(p)).toBe(p);
      expect(back.commission, String(p)).toBe(forward.commission);
      expect(back.driverNet, String(p)).toBe(forward.driverNet);
    }
  });

  it("affiche toujours le total réellement facturé", () => {
    // Le total stocké fait foi : il a été encaissé. Le détail s'ajuste à lui,
    // jamais l'inverse — sinon la facture affichée cesse de correspondre au
    // relevé bancaire du client.
    for (const total of [178.5, 210, 535.5, 1050, 99.99]) {
      const s = breakdownFromClientTotal(total);
      expect(s.clientTotal, String(total)).toBe(total);
      expect(s.driverPrice + s.clientFee, String(total)).toBeCloseTo(total, 10);
    }
  });

  it("neutralise un total absent ou négatif", () => {
    expect(breakdownFromClientTotal(0).driverPrice).toBe(0);
    expect(breakdownFromClientTotal(-10).clientTotal).toBe(0);
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
