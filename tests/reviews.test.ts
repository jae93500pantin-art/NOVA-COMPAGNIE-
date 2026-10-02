import { describe, it, expect } from "vitest";
import {
  COMMENT_MAX,
  COMMENT_MIN,
  REVIEW_DISCLOSURE,
  ratingSummary,
  reviewAuthorError,
  reviewContentError,
  reviewSignature,
  type Review,
} from "@/lib/reviews";

const review = (over: Partial<Review> = {}): Review => ({
  id: "r1",
  driverId: "jean-dupont",
  authorId: "a1",
  authorName: "Claire M.",
  rating: 5,
  comment: "Chauffeur ponctuel et véhicule impeccable.",
  createdAt: "2026-10-01T10:00:00.000Z",
  ...over,
});

describe("reviewContentError", () => {
  it("accepte une note entière de 1 à 5 avec un commentaire suffisant", () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      expect(
        reviewContentError({ rating, comment: "Très bonne prestation." })
      ).toBeNull();
    }
  });

  it("refuse une note hors bornes, nulle ou fractionnaire", () => {
    for (const rating of [0, 6, -1, 2.5, Number.NaN]) {
      expect(
        reviewContentError({ rating, comment: "Très bonne prestation." })
      ).toBe("rating");
    }
  });

  it("mesure le commentaire APRÈS trim", () => {
    // Sinon une suite d'espaces passerait la borne basse et publierait un avis
    // vide, qui compte pourtant dans la moyenne du chauffeur.
    const spaces = " ".repeat(COMMENT_MIN + 5);
    expect(reviewContentError({ rating: 4, comment: spaces })).toBe(
      "commentShort"
    );
  });

  it("refuse un commentaire trop long", () => {
    expect(
      reviewContentError({ rating: 4, comment: "a".repeat(COMMENT_MAX + 1) })
    ).toBe("commentLong");
  });

  it("accepte exactement les bornes", () => {
    expect(
      reviewContentError({ rating: 1, comment: "a".repeat(COMMENT_MIN) })
    ).toBeNull();
    expect(
      reviewContentError({ rating: 5, comment: "a".repeat(COMMENT_MAX) })
    ).toBeNull();
  });
});

describe("reviewAuthorError", () => {
  it("exige une session", () => {
    expect(reviewAuthorError({ signedIn: false })).toBe("notSignedIn");
  });

  it("n'accepte que le rôle client", () => {
    expect(reviewAuthorError({ signedIn: true, role: "client" })).toBeNull();
    // ⚠️ Un chauffeur n'évalue pas un confrère, et un admin ne signe pas un
    // avis client sur un professionnel que la plateforme référence.
    expect(reviewAuthorError({ signedIn: true, role: "driver" })).toBe("notClient");
    expect(reviewAuthorError({ signedIn: true, role: "admin" })).toBe("notClient");
    expect(reviewAuthorError({ signedIn: true, role: null })).toBe("notClient");
    expect(reviewAuthorError({ signedIn: true })).toBe("notClient");
  });

  it("un chauffeur est refusé même sans avis existant", () => {
    expect(
      reviewAuthorError({ signedIn: true, role: "driver", alreadyReviewed: false })
    ).toBe("notClient");
  });

  it("refuse un second avis du même auteur", () => {
    expect(
      reviewAuthorError({ signedIn: true, role: "client", alreadyReviewed: true })
    ).toBe("duplicate");
  });

  it("l'absence de session primait sur tout le reste", () => {
    // L'ordre compte : répondre « déjà évalué » à un visiteur anonyme
    // révélerait qu'un compte a évalué ce chauffeur.
    expect(
      reviewAuthorError({ signedIn: false, role: "client", alreadyReviewed: true })
    ).toBe("notSignedIn");
  });
});

describe("ratingSummary", () => {
  it("rend null — et PAS 0 — sans aucun avis", () => {
    // ⚠️ Le cœur du garde-fou : 0 s'afficherait comme la plus mauvaise note
    // possible sur la fiche d'un professionnel réel qui n'a aucun avis.
    const s = ratingSummary([]);
    expect(s.average).toBeNull();
    expect(s.count).toBe(0);
  });

  it("ne lit jamais une note de la fiche, seulement les avis listés", () => {
    // `drivers.rating` vaut 5.0 par défaut en base ; la moyenne doit venir
    // d'ici, sinon chaque fiche neuve publierait « 5,0 ★ · 0 avis ».
    const s = ratingSummary([review({ rating: 2 })]);
    expect(s.average).toBe(2);
    expect(s.count).toBe(1);
  });

  it("arrondit la moyenne au dixième", () => {
    const s = ratingSummary([
      review({ id: "a", rating: 5 }),
      review({ id: "b", rating: 4 }),
      review({ id: "c", rating: 4 }),
    ]);
    expect(s.average).toBe(4.3);
  });

  it("compte la répartition par étoile", () => {
    const s = ratingSummary([
      review({ id: "a", rating: 5 }),
      review({ id: "b", rating: 5 }),
      review({ id: "c", rating: 3 }),
    ]);
    expect(s.distribution[5]).toBe(2);
    expect(s.distribution[3]).toBe(1);
    expect(s.distribution[1]).toBe(0);
  });

  it("la répartition est toujours complète, même vide", () => {
    const s = ratingSummary([]);
    expect(Object.keys(s.distribution).sort()).toEqual(["1", "2", "3", "4", "5"]);
  });
});

describe("reviewSignature", () => {
  it("rend le prénom et l'initiale du nom", () => {
    // Jamais le nom complet : l'auteur est un particulier, et sa signature
    // est publique et indexable.
    expect(reviewSignature("Claire", "Moreau")).toBe("Claire M.");
  });

  it("se contente du prénom quand le nom manque", () => {
    expect(reviewSignature("Claire", "")).toBe("Claire");
    expect(reviewSignature("Claire", null)).toBe("Claire");
  });

  it("retombe sur un libellé neutre quand il n'y a plus d'auteur", () => {
    // Un compte supprimé met `author_id` à null : l'avis reste, car le retirer
    // réécrirait la moyenne du chauffeur à chaque suppression de compte.
    expect(reviewSignature(null, null)).toBe("Client Nova");
    expect(reviewSignature("  ", "Moreau")).toBe("Client Nova");
  });
});

describe("la mention obligatoire", () => {
  it("dit explicitement que les avis ne sont pas vérifiés", () => {
    // Publier des avis de consommateurs oblige à indiquer s'ils sont vérifiés
    // et comment (art. L111-7-2 du Code de la consommation).
    expect(REVIEW_DISCLOSURE).toMatch(/ne sont pas vérifiés/i);
  });

  it("n'emploie NI « certifié » NI « vérifiés » comme une promesse", () => {
    // ⚠️ Ce test est le garde-fou contre une réécriture bien intentionnée du
    // libellé : Nova n'organise pas les courses, donc rien n'est certifiable.
    expect(REVIEW_DISCLOSURE).not.toMatch(/certifi/i);
    expect(REVIEW_DISCLOSURE).not.toMatch(/avis vérifiés/i);
  });
});
