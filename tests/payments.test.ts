import { describe, it, expect } from "vitest";
import {
  computeAmount,
  computeBookingAmount,
  clampHours,
  isSettlementAllowed,
  MIN_HOURS,
  MAX_HOURS,
} from "@/lib/payments";

describe("payments — clampHours", () => {
  it("garde une valeur dans la plage", () => {
    expect(clampHours(3)).toBe(3);
  });

  it("applique le minimum", () => {
    expect(clampHours(0)).toBe(MIN_HOURS);
    expect(clampHours(-5)).toBe(MIN_HOURS);
  });

  it("applique le maximum", () => {
    expect(clampHours(100)).toBe(MAX_HOURS);
  });

  it("arrondit à l'entier inférieur", () => {
    expect(clampHours(3.9)).toBe(3);
  });

  it("gère les valeurs non finies", () => {
    expect(clampHours(NaN)).toBe(MIN_HOURS);
    expect(clampHours(Infinity)).toBe(MAX_HOURS);
  });
});

describe("payments — computeBookingAmount", () => {
  it("ajoute 5 % de frais au tarif course", () => {
    const a = computeBookingAmount(100, 3);
    expect(a.subtotal).toBe(300); // tarif course
    expect(a.serviceFee).toBe(15); // + 5 %
    expect(a.total).toBe(315); // ce que règle le client
  });

  it("prélève 15 % au chauffeur, sur le tarif course seul", () => {
    const a = computeBookingAmount(100, 3);
    expect(a.commission).toBe(45); // 15 % de 300, pas de 315
    expect(a.driverNet).toBe(255);
    expect(a.commission + a.driverNet).toBe(a.subtotal);
  });

  it("convertit le total client en centimes pour Stripe", () => {
    const a = computeBookingAmount(98, 2); // 196 + 9,80
    expect(a.subtotal).toBe(196);
    expect(a.serviceFee).toBe(9.8);
    expect(a.total).toBe(205.8);
    expect(a.amountCents).toBe(20580);
  });

  it("facture en centimes entiers, sans traîne flottante", () => {
    // 5 % de 170 € vaut 8,50 € : c'est exactement le montant qu'un arrondi à
    // l'euro (ou une multiplication brute par 100) ferait dérailler.
    const a = computeBookingAmount(170, 1);
    expect(a.total).toBe(178.5);
    expect(a.amountCents).toBe(17850);
    expect(Number.isInteger(a.amountCents)).toBe(true);
  });

  it("clampe les heures avant calcul", () => {
    const a = computeBookingAmount(50, 999);
    expect(a.hours).toBe(MAX_HOURS);
    expect(a.subtotal).toBe(50 * MAX_HOURS);
  });

  it("garde le total égal à la somme de ses lignes", () => {
    for (const [rate, hours] of [[95, 1], [120, 3], [149, 7], [233, 24]]) {
      const a = computeBookingAmount(rate, hours);
      expect(a.subtotal + a.serviceFee, `${rate}×${hours}`).toBeCloseTo(a.total, 10);
      expect(a.amountCents, `${rate}×${hours}`).toBe(Math.round(a.total * 100));
    }
  });

  it("rejette un tarif horaire invalide", () => {
    expect(() => computeBookingAmount(0, 3)).toThrow();
    expect(() => computeBookingAmount(-10, 3)).toThrow();
    expect(() => computeBookingAmount(NaN, 3)).toThrow();
  });

  it("ne produit jamais un montant nul ou négatif pour un tarif valide", () => {
    const a = computeBookingAmount(10, 1);
    expect(a.amountCents).toBeGreaterThan(0);
  });
});

describe("payments — forfait transfert aéroport", () => {
  it("facture le forfait tel quel, sans multiplier par la quantité", () => {
    const a = computeAmount(170, 900, "transfer", 5, 200);
    expect(a.subtotal).toBe(200);
    expect(a.hours).toBe(1); // une seule course
  });

  it("applique le barème au forfait comme aux autres unités", () => {
    // Le transfert et la journée ont longtemps été à zéro frais pendant que
    // l'heure en portait : un barème qui ne vaut que pour une unité sur trois
    // est un barème qu'on oublie d'appliquer.
    const a = computeAmount(170, 900, "transfer", 1, 200);
    expect(a.serviceFee).toBe(10);
    expect(a.total).toBe(210);
    expect(a.commission).toBe(30);
    expect(a.driverNet).toBe(170);
    expect(a.amountCents).toBe(21000);
  });

  it("ignore complètement les tarifs horaire et journalier", () => {
    const cheap = computeAmount(50, 300, "transfer", 1, 100);
    const pricey = computeAmount(500, 3000, "transfer", 1, 100);
    expect(cheap.total).toBe(pricey.total);
  });

  it("refuse un forfait absent ou invalide", () => {
    expect(() => computeAmount(170, 900, "transfer", 1, 0)).toThrow();
    expect(() => computeAmount(170, 900, "transfer", 1, -50)).toThrow();
    expect(() => computeAmount(170, 900, "transfer", 1, NaN)).toThrow();
  });

  it("facture heure et jour sur leur propre tarif", () => {
    const hour = computeAmount(170, 900, "hour", 3, 200);
    expect(hour.subtotal).toBe(510);
    expect(hour.total).toBe(535.5); // 510 + 5 %
    expect(hour.driverNet).toBe(433.5); // 510 − 15 %

    const day = computeAmount(170, 900, "day", 2, 200);
    expect(day.subtotal).toBe(1800);
    expect(day.total).toBe(1890);
    expect(day.driverNet).toBe(1530);
  });
});

describe("payments — isSettlementAllowed", () => {
  it("autorise le reglement quand Stripe est configure", () => {
    expect(
      isSettlementAllowed({ stripeConfigured: true, realAccounts: true })
    ).toBe(true);
  });

  it("laisse la demo sans cles regler une course", () => {
    // C'est ce que la demo demontre : la couper reviendrait a casser le
    // parcours qu'un visiteur sans compte vient voir.
    expect(
      isSettlementAllowed({ stripeConfigured: false, realAccounts: false })
    ).toBe(true);
  });

  it("REFUSE des comptes reels sans dispositif de paiement", () => {
    // Le seul cas dangereux : deux vraies personnes, et un reglement fictif.
    expect(
      isSettlementAllowed({ stripeConfigured: false, realAccounts: true })
    ).toBe(false);
  });

  it("autorise Stripe seul, sans comptes reels (test local)", () => {
    expect(
      isSettlementAllowed({ stripeConfigured: true, realAccounts: false })
    ).toBe(true);
  });
});
