import { describe, it, expect, beforeEach } from "vitest";
import {
  getDriverOverrides,
  saveDriverOverrides,
  applyDriverOverrides,
} from "@/lib/driverOverrides";
import { BUSINESS_DRIVER, LUXURY_DRIVER } from "./fixtures/drivers";

/**
 * L'annuaire en dur est vide : ces tests portent sur la fusion des surcharges,
 * pas sur les profils. Ils s'appuient donc sur des fixtures — une gamme à
 * tarif imposé (Business) et une gamme premium à tarif libre (Luxury).
 */
const getDriver = (id: string) =>
  id === LUXURY_DRIVER.id ? LUXURY_DRIVER : BUSINESS_DRIVER;
const BUSINESS = BUSINESS_DRIVER.id;
const PREMIUM = LUXURY_DRIVER.id;

describe("driverOverrides — édition du profil chauffeur", () => {
  beforeEach(() => localStorage.clear());

  it("n'a aucun override au départ", () => {
    expect(getDriverOverrides(BUSINESS)).toEqual({});
  });

  it("enregistre et relit des overrides", () => {
    saveDriverOverrides(BUSINESS, { pricePerHour: 120, available: false });
    const o = getDriverOverrides(BUSINESS);
    expect(o.pricePerHour).toBe(120);
    expect(o.available).toBe(false);
  });

  it("fusionne les overrides successifs", () => {
    saveDriverOverrides(BUSINESS, { pricePerHour: 120 });
    saveDriverOverrides(BUSINESS, { bio: "Nouvelle bio" });
    const o = getDriverOverrides(BUSINESS);
    expect(o.pricePerHour).toBe(120);
    expect(o.bio).toBe("Nouvelle bio");
  });

  it("applique les overrides sur le profil de base", () => {
    const base = getDriver(BUSINESS)!;
    saveDriverOverrides(BUSINESS, { bio: "Nouvelle bio" });
    const merged = applyDriverOverrides(base);
    expect(merged.bio).toBe("Nouvelle bio");
    // les champs non modifiés restent intacts
    expect(merged.firstName).toBe(base.firstName);
    expect(merged.car.model).toBe(base.car.model);
  });

  it("garde le tarif du chauffeur, quelle que soit sa gamme", () => {
    // Statut d'annuaire : aucun tarif n'est imposé. Les deux fixtures sont de
    // gammes différentes (Business et Luxury) et reçoivent le MÊME tarif — la
    // gamme n'a plus voix au chapitre. L'ancienne version ramenait le premier
    // à 120 €/h imposés et bornait le second à 250 €/h.
    for (const slug of [BUSINESS, PREMIUM]) {
      const base = getDriver(slug)!;
      saveDriverOverrides(slug, { pricePerHour: 400, pricePerDay: 3500 });
      const merged = applyDriverOverrides(base);
      expect(merged.pricePerHour, slug).toBe(400);
      expect(merged.pricePerDay, slug).toBe(3500);
    }
  });

  it("laisse un tarif effacé à zéro, sans le remplacer", () => {
    // ⚠️ 0 se lit « non communiqué », et surtout pas « au tarif plateforme » :
    // l'ancienne version remontait un 0 à 120 €/h. Ni le plancher d'une bande,
    // ni le tarif d'origine de la fiche — le chauffeur a retiré son prix, la
    // fiche cesse simplement de paraître (`isListable`, lib/driverDirectory).
    const base = getDriver(PREMIUM)!;
    saveDriverOverrides(PREMIUM, { pricePerHour: 0 });
    expect(applyDriverOverrides(base).pricePerHour).toBe(0);
  });

  it("plafonne une valeur aberrante au garde-fou de saisie", () => {
    const base = getDriver(PREMIUM)!;
    saveDriverOverrides(PREMIUM, { pricePerHour: 99999 });
    expect(applyDriverOverrides(base).pricePerHour).toBe(1000);
  });

  it("isole les overrides par chauffeur", () => {
    saveDriverOverrides(BUSINESS, { pricePerHour: 200 });
    expect(getDriverOverrides(PREMIUM)).toEqual({});
  });
});

describe("driverOverrides — véhicule et photo de profil", () => {
  beforeEach(() => localStorage.clear());

  it("applique la description du véhicule saisie par le chauffeur", () => {
    const base = getDriver(BUSINESS)!;
    saveDriverOverrides(BUSINESS, {
      car: { make: "Audi", model: "A8 L", year: 2025, color: "Noir" },
    });
    const merged = applyDriverOverrides(base);
    expect(merged.car.make).toBe("Audi");
    expect(merged.car.model).toBe("A8 L");
    expect(merged.car.year).toBe(2025);
    expect(merged.car.color).toBe("Noir");
  });

  it("reprend la valeur d'origine sur un champ vidé", () => {
    const base = getDriver(BUSINESS)!;
    saveDriverOverrides(BUSINESS, {
      car: { make: "  ", model: "", year: 0, color: "   " },
    });
    const merged = applyDriverOverrides(base);
    expect(merged.car.make).toBe(base.car.make);
    expect(merged.car.model).toBe(base.car.model);
    expect(merged.car.year).toBe(base.car.year);
    expect(merged.car.color).toBe(base.car.color);
  });

  it("ne perd pas les photos en modifiant le modèle", () => {
    const base = getDriver(BUSINESS)!;
    saveDriverOverrides(BUSINESS, { carPhotos: ["data:image/jpeg;base64,AAA"] });
    saveDriverOverrides(BUSINESS, { car: { model: "Classe S" } });
    const merged = applyDriverOverrides(base);
    expect(merged.car.model).toBe("Classe S");
    expect(merged.car.photos).toEqual(["data:image/jpeg;base64,AAA"]);
  });

  it("remplace la photo de profil, et la vide rétablit l'originale", () => {
    const base = getDriver(BUSINESS)!;
    saveDriverOverrides(BUSINESS, { avatar: "data:image/jpeg;base64,BBB" });
    expect(applyDriverOverrides(base).avatar).toBe("data:image/jpeg;base64,BBB");
    saveDriverOverrides(BUSINESS, { avatar: "" });
    expect(applyDriverOverrides(base).avatar).toBe(base.avatar);
  });
});
