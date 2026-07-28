import { describe, it, expect } from "vitest";
import { driverCoords, cityCoords } from "@/lib/geo";
import { getDriver, drivers, driversByCity } from "@/lib/drivers";

describe("drivers — données & accesseurs", () => {
  it("inclut le chauffeur Jérémy avec sa Mercedes E63", () => {
    const j = getDriver("jeremy-driver");
    expect(j).toBeTruthy();
    expect(j?.firstName).toBe("Jérémy");
    expect(j?.car.model).toContain("E63");
  });

  it("retourne undefined pour un id inconnu", () => {
    expect(getDriver("inconnu")).toBeUndefined();
  });

  it("filtre les chauffeurs par ville", () => {
    const paris = driversByCity("paris");
    expect(paris.length).toBeGreaterThan(0);
    expect(paris.every((d) => d.cityId === "paris")).toBe(true);
  });

  it("chaque chauffeur a des champs cohérents", () => {
    for (const d of drivers) {
      expect(d.id).toBeTruthy();
      expect(d.rating).toBeGreaterThanOrEqual(0);
      expect(d.rating).toBeLessThanOrEqual(5);
      expect(d.pricePerHour).toBeGreaterThan(0);
      expect(d.car.photos.length).toBeGreaterThan(0);
    }
  });
});

describe("geo — coordonnées carte", () => {
  it("ne connaît que Paris", () => {
    expect(Object.keys(cityCoords)).toEqual(["paris"]);
  });

  it("place un chauffeur près du centre de sa ville", () => {
    const j = getDriver("jeremy-driver")!;
    const [lng, lat] = driverCoords(j);
    const [clng, clat] = cityCoords.paris;
    // dispersion < ~0.1° autour du centre
    expect(Math.abs(lng - clng)).toBeLessThan(0.15);
    expect(Math.abs(lat - clat)).toBeLessThan(0.15);
  });

  it("est déterministe (mêmes coords pour le même chauffeur)", () => {
    const j = getDriver("jeremy-driver")!;
    expect(driverCoords(j)).toEqual(driverCoords(j));
  });
});
