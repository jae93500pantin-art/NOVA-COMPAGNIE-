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

  it("accepte un tarif libre dans la bande d'une gamme premium", () => {
    // La fixture premium est en gamme Luxury : 150–250 €/h.
    const base = getDriver(PREMIUM)!;
    saveDriverOverrides(PREMIUM, { pricePerHour: 220 });
    expect(applyDriverOverrides(base).pricePerHour).toBe(220);
  });

  it("ignore un tarif stocké hors bande, même en gamme premium", () => {
    const base = getDriver(PREMIUM)!;
    saveDriverOverrides(PREMIUM, { pricePerHour: 900 });
    expect(applyDriverOverrides(base).pricePerHour).toBe(250); // plafond
  });

  it("ramène une gamme à prix fixe sur son tarif imposé", () => {
    // La fixture standard est en gamme Business : 120 €/h imposés.
    const base = getDriver(BUSINESS)!;
    saveDriverOverrides(BUSINESS, { pricePerHour: 500, pricePerDay: 5000 });
    const merged = applyDriverOverrides(base);
    expect(merged.pricePerHour).toBe(120);
    expect(merged.pricePerDay).toBe(1000);
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
