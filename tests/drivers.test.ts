import { describe, it, expect } from "vitest";
import { driverCoords, cityCoords } from "@/lib/geo";
import { drivers, getDriver, driversByCity } from "@/lib/drivers";
import { LUXURY_DRIVER, FIXTURE_DRIVERS } from "./fixtures/drivers";

/**
 * L'annuaire en dur a été vidé : un site marchand accessible ne peut pas
 * présenter de faux professionnels. Ce qui reste à vérifier ici, ce n'est plus
 * son contenu mais son **comportement à vide** — c'est désormais l'état par
 * défaut de l'application, et c'est lui qui doit ne rien casser.
 */
describe("annuaire — vide par défaut", () => {
  it("ne contient aucun chauffeur inventé", () => {
    expect(drivers).toHaveLength(0);
  });

  it("retourne undefined plutôt que de lever pour un id quelconque", () => {
    expect(getDriver("inconnu")).toBeUndefined();
    // Les anciens profils fictifs ne doivent plus répondre.
    expect(getDriver("jeremy-driver")).toBeUndefined();
  });

  it("renvoie une liste vide pour une ville, jamais undefined", () => {
    // Les appelants itèrent dessus sans garde : un undefined casserait la page.
    expect(driversByCity("paris")).toEqual([]);
  });
});

describe("geo — coordonnées carte", () => {
  it("ne connaît que Paris", () => {
    expect(Object.keys(cityCoords)).toEqual(["paris"]);
  });

  it("place un chauffeur près du centre de sa ville", () => {
    const [lng, lat] = driverCoords(LUXURY_DRIVER);
    const [clng, clat] = cityCoords.paris;
    // dispersion < ~0.15° autour du centre
    expect(Math.abs(lng - clng)).toBeLessThan(0.15);
    expect(Math.abs(lat - clat)).toBeLessThan(0.15);
  });

  it("est déterministe (mêmes coords pour le même chauffeur)", () => {
    expect(driverCoords(LUXURY_DRIVER)).toEqual(driverCoords(LUXURY_DRIVER));
  });

  it("disperse deux chauffeurs différents", () => {
    const a = driverCoords(FIXTURE_DRIVERS[0]);
    const b = driverCoords(FIXTURE_DRIVERS[1]);
    expect(a).not.toEqual(b);
  });
});
