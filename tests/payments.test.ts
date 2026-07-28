import { describe, it, expect } from "vitest";
import {
  computeBookingAmount,
  clampHours,
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
  it("calcule sous-total et total (aucun frais de service)", () => {
    const a = computeBookingAmount(100, 3);
    expect(a.subtotal).toBe(300);
    expect(a.serviceFee).toBe(0);
    expect(a.total).toBe(300);
  });

  it("convertit le total en centimes pour Stripe", () => {
    const a = computeBookingAmount(98, 2); // 196, aucun frais
    expect(a.subtotal).toBe(196);
    expect(a.serviceFee).toBe(0);
    expect(a.total).toBe(196);
    expect(a.amountCents).toBe(19600);
  });

  it("clampe les heures avant calcul", () => {
    const a = computeBookingAmount(50, 999);
    expect(a.hours).toBe(MAX_HOURS);
    expect(a.subtotal).toBe(50 * MAX_HOURS);
  });

  it("ne facture aucun frais de service", () => {
    const a = computeBookingAmount(95, 1);
    expect(a.serviceFee).toBe(0);
    expect(a.total).toBe(95);
    expect(a.amountCents).toBe(9500);
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
