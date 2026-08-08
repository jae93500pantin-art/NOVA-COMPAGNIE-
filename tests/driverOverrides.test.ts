import { describe, it, expect, beforeEach } from "vitest";
import {
  getDriverOverrides,
  saveDriverOverrides,
  applyDriverOverrides,
} from "@/lib/driverOverrides";
import { getDriver } from "@/lib/drivers";

describe("driverOverrides — édition du profil chauffeur", () => {
  beforeEach(() => localStorage.clear());

  it("n'a aucun override au départ", () => {
    expect(getDriverOverrides("jeremy-driver")).toEqual({});
  });

  it("enregistre et relit des overrides", () => {
    saveDriverOverrides("jeremy-driver", { pricePerHour: 120, available: false });
    const o = getDriverOverrides("jeremy-driver");
    expect(o.pricePerHour).toBe(120);
    expect(o.available).toBe(false);
  });

  it("fusionne les overrides successifs", () => {
    saveDriverOverrides("jeremy-driver", { pricePerHour: 120 });
    saveDriverOverrides("jeremy-driver", { bio: "Nouvelle bio" });
    const o = getDriverOverrides("jeremy-driver");
    expect(o.pricePerHour).toBe(120);
    expect(o.bio).toBe("Nouvelle bio");
  });

  it("applique les overrides sur le profil de base", () => {
    const base = getDriver("jeremy-driver")!;
    saveDriverOverrides("jeremy-driver", { bio: "Nouvelle bio" });
    const merged = applyDriverOverrides(base);
    expect(merged.bio).toBe("Nouvelle bio");
    // les champs non modifiés restent intacts
    expect(merged.firstName).toBe(base.firstName);
    expect(merged.car.model).toBe(base.car.model);
  });

  it("accepte un tarif libre dans la bande d'une gamme premium", () => {
    // alexandre-moreau est en gamme Luxury : 150–250 €/h.
    const base = getDriver("alexandre-moreau")!;
    saveDriverOverrides("alexandre-moreau", { pricePerHour: 220 });
    expect(applyDriverOverrides(base).pricePerHour).toBe(220);
  });

  it("ignore un tarif stocké hors bande, même en gamme premium", () => {
    const base = getDriver("alexandre-moreau")!;
    saveDriverOverrides("alexandre-moreau", { pricePerHour: 900 });
    expect(applyDriverOverrides(base).pricePerHour).toBe(250); // plafond
  });

  it("ramène une gamme à prix fixe sur son tarif imposé", () => {
    // jeremy-driver est en gamme Business : 120 €/h imposés.
    const base = getDriver("jeremy-driver")!;
    saveDriverOverrides("jeremy-driver", { pricePerHour: 500, pricePerDay: 5000 });
    const merged = applyDriverOverrides(base);
    expect(merged.pricePerHour).toBe(120);
    expect(merged.pricePerDay).toBe(1000);
  });

  it("isole les overrides par chauffeur", () => {
    saveDriverOverrides("jeremy-driver", { pricePerHour: 200 });
    expect(getDriverOverrides("alexandre-moreau")).toEqual({});
  });
});

describe("driverOverrides — véhicule et photo de profil", () => {
  beforeEach(() => localStorage.clear());

  it("applique la description du véhicule saisie par le chauffeur", () => {
    const base = getDriver("jeremy-driver")!;
    saveDriverOverrides("jeremy-driver", {
      car: { make: "Audi", model: "A8 L", year: 2025, color: "Noir" },
    });
    const merged = applyDriverOverrides(base);
    expect(merged.car.make).toBe("Audi");
    expect(merged.car.model).toBe("A8 L");
    expect(merged.car.year).toBe(2025);
    expect(merged.car.color).toBe("Noir");
  });

  it("reprend la valeur d'origine sur un champ vidé", () => {
    const base = getDriver("jeremy-driver")!;
    saveDriverOverrides("jeremy-driver", {
      car: { make: "  ", model: "", year: 0, color: "   " },
    });
    const merged = applyDriverOverrides(base);
    expect(merged.car.make).toBe(base.car.make);
    expect(merged.car.model).toBe(base.car.model);
    expect(merged.car.year).toBe(base.car.year);
    expect(merged.car.color).toBe(base.car.color);
  });

  it("ne perd pas les photos en modifiant le modèle", () => {
    const base = getDriver("jeremy-driver")!;
    saveDriverOverrides("jeremy-driver", { carPhotos: ["data:image/jpeg;base64,AAA"] });
    saveDriverOverrides("jeremy-driver", { car: { model: "Classe S" } });
    const merged = applyDriverOverrides(base);
    expect(merged.car.model).toBe("Classe S");
    expect(merged.car.photos).toEqual(["data:image/jpeg;base64,AAA"]);
  });

  it("remplace la photo de profil, et la vide rétablit l'originale", () => {
    const base = getDriver("jeremy-driver")!;
    saveDriverOverrides("jeremy-driver", { avatar: "data:image/jpeg;base64,BBB" });
    expect(applyDriverOverrides(base).avatar).toBe("data:image/jpeg;base64,BBB");
    saveDriverOverrides("jeremy-driver", { avatar: "" });
    expect(applyDriverOverrides(base).avatar).toBe(base.avatar);
  });
});
