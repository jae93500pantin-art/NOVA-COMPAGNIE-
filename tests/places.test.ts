import { describe, it, expect } from "vitest";
import {
  fromGoogle,
  fromMapbox,
  MIN_PLACES_QUERY,
  normalizeQuery,
  PLACES_LIMIT,
  shouldQueryPlaces,
  splitPlaceLabel,
} from "@/lib/places";

describe("adresses — quand interroger", () => {
  it("attend assez de caractères", () => {
    expect(shouldQueryPlaces("ru")).toBe(false);
    expect(shouldQueryPlaces("rue")).toBe(true);
    expect(MIN_PLACES_QUERY).toBe(3);
  });

  it("ne compte pas les espaces comme de la saisie", () => {
    // « ru  » n'est pas une requête de trois caractères : l'envoyer facturerait
    // un appel pour une réponse inutilisable.
    expect(shouldQueryPlaces("  ru  ")).toBe(false);
    expect(shouldQueryPlaces("   ")).toBe(false);
  });

  it("normalise identiquement des deux côtés", () => {
    expect(normalizeQuery("  12   rue  de Rivoli ")).toBe("12 rue de Rivoli");
    expect(normalizeQuery(null)).toBe("");
    expect(normalizeQuery(42)).toBe("");
  });
});

describe("adresses — découpage de l'intitulé", () => {
  it("sépare l'adresse de ce qui la situe", () => {
    expect(splitPlaceLabel("12 rue de Rivoli, 75001 Paris, France")).toEqual({
      label: "12 rue de Rivoli",
      context: "75001 Paris, France",
    });
  });

  it("supporte une adresse sans contexte", () => {
    expect(splitPlaceLabel("Gare de Lyon")).toEqual({
      label: "Gare de Lyon",
      context: "",
    });
  });

  it("ne casse pas sur une chaîne vide", () => {
    expect(splitPlaceLabel("")).toEqual({ label: "", context: "" });
  });
});

describe("adresses — réponse Mapbox", () => {
  const payload = {
    features: [
      {
        id: "address.1",
        place_name: "12 rue de Rivoli, 75001 Paris, France",
        center: [2.3522, 48.8566],
      },
      { id: "poi.2", place_name: "Gare de Lyon, Paris, France", center: [2.37, 48.84] },
    ],
  };

  it("normalise les suggestions", () => {
    const [first] = fromMapbox(payload);
    expect(first.label).toBe("12 rue de Rivoli");
    expect(first.context).toBe("75001 Paris, France");
    expect(first.full).toBe("12 rue de Rivoli, 75001 Paris, France");
    expect(first.lng).toBe(2.3522);
    expect(first.lat).toBe(48.8566);
  });

  it("survit à une réponse inattendue", () => {
    // Un fournisseur qui change de forme ne doit pas faire planter un champ de
    // saisie : on préfère aucune suggestion à une exception.
    for (const bad of [null, undefined, {}, { features: "non" }, []]) {
      expect(fromMapbox(bad), JSON.stringify(bad)).toEqual([]);
    }
  });

  it("ignore une entrée sans libellé", () => {
    expect(fromMapbox({ features: [{ id: "x" }, ...payload.features] })).toHaveLength(2);
  });

  it("borne le nombre de suggestions", () => {
    const many = { features: Array.from({ length: 20 }, (_, i) => ({
      id: `a${i}`,
      place_name: `${i} rue Test, Paris`,
    })) };
    expect(fromMapbox(many)).toHaveLength(PLACES_LIMIT);
  });
});

describe("adresses — réponse Google", () => {
  it("préfère le découpage fourni par Google", () => {
    const [first] = fromGoogle({
      predictions: [
        {
          place_id: "abc",
          description: "12 rue de Rivoli, 75001 Paris, France",
          structured_formatting: {
            main_text: "12 rue de Rivoli",
            secondary_text: "75001 Paris, France",
          },
        },
      ],
    });
    expect(first.id).toBe("abc");
    expect(first.label).toBe("12 rue de Rivoli");
    expect(first.context).toBe("75001 Paris, France");
  });

  it("retombe sur notre découpage quand Google ne le donne pas", () => {
    const [first] = fromGoogle({
      predictions: [{ place_id: "x", description: "Gare du Nord, Paris, France" }],
    });
    expect(first.label).toBe("Gare du Nord");
    expect(first.context).toBe("Paris, France");
  });

  it("n'invente aucune coordonnée", () => {
    // L'autocomplétion Google ne renvoie pas de point : il faudrait un second
    // appel facturé. Mieux vaut `undefined` qu'un lieu fabriqué.
    const [first] = fromGoogle({
      predictions: [{ place_id: "x", description: "Gare du Nord, Paris" }],
    });
    expect(first.lng).toBeUndefined();
    expect(first.lat).toBeUndefined();
  });

  it("survit à une réponse inattendue", () => {
    for (const bad of [null, {}, { predictions: 3 }]) {
      expect(fromGoogle(bad), JSON.stringify(bad)).toEqual([]);
    }
  });
});
