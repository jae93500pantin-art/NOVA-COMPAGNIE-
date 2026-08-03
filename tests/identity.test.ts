import { describe, it, expect } from "vitest";
import {
  avatarFromMetadata,
  nameFromMetadata,
  splitFullName,
} from "@/lib/identity";

describe("identity — métadonnées des fournisseurs d'identité", () => {
  it("garde les noms composés dans le nom de famille", () => {
    expect(splitFullName("Jean Pierre Dupont")).toEqual({
      firstName: "Jean",
      lastName: "Pierre Dupont",
    });
  });

  it("gère un prénom seul et une chaîne vide", () => {
    expect(splitFullName("Madonna")).toEqual({ firstName: "Madonna", lastName: "" });
    expect(splitFullName("   ")).toEqual({ firstName: "", lastName: "" });
  });

  it("préfère nos propres clés (inscription e-mail)", () => {
    expect(
      nameFromMetadata({ first_name: "Jérémy", last_name: "Dubois", name: "Autre Nom" })
    ).toEqual({ firstName: "Jérémy", lastName: "Dubois" });
  });

  it("lit les clés Google given_name / family_name", () => {
    expect(
      nameFromMetadata({ given_name: "Ada", family_name: "Lovelace" })
    ).toEqual({ firstName: "Ada", lastName: "Lovelace" });
  });

  it("retombe sur full_name puis name", () => {
    expect(nameFromMetadata({ full_name: "Ada Lovelace" })).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
    });
    expect(nameFromMetadata({ name: "Ada Lovelace" })).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
    });
  });

  it("ne casse pas sur des métadonnées absentes ou mal typées", () => {
    expect(nameFromMetadata(null)).toEqual({ firstName: "", lastName: "" });
    expect(nameFromMetadata({ first_name: 42 })).toEqual({ firstName: "", lastName: "" });
  });

  it("récupère la photo de profil (avatar_url ou picture)", () => {
    expect(
      avatarFromMetadata({ avatar_url: "https://lh3.googleusercontent.com/a/x" })
    ).toBe("https://lh3.googleusercontent.com/a/x");
    expect(avatarFromMetadata({ picture: "https://lh3.googleusercontent.com/a/y" })).toBe(
      "https://lh3.googleusercontent.com/a/y"
    );
  });

  it("rejette une photo non https (anti-mixed-content)", () => {
    expect(avatarFromMetadata({ picture: "http://example.com/a.png" })).toBeUndefined();
    expect(avatarFromMetadata({ picture: "javascript:alert(1)" })).toBeUndefined();
    expect(avatarFromMetadata({})).toBeUndefined();
  });
});
