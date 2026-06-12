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
    saveDriverOverrides("jeremy-driver", { pricePerHour: 150 });
    const merged = applyDriverOverrides(base);
    expect(merged.pricePerHour).toBe(150);
    // les champs non modifiés restent intacts
    expect(merged.firstName).toBe(base.firstName);
    expect(merged.car.model).toBe(base.car.model);
  });

  it("isole les overrides par chauffeur", () => {
    saveDriverOverrides("jeremy-driver", { pricePerHour: 200 });
    expect(getDriverOverrides("alexandre-moreau")).toEqual({});
  });
});
