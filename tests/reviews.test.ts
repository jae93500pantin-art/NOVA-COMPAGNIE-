import { describe, it, expect } from "vitest";
import {
  REVIEW_MAX_COMMENT,
  buildReview,
  canReviewBooking,
  formatReviewAge,
  maskAuthorName,
  ratingSummary,
  refusalMessage,
  reviewError,
  tripLabelFromBooking,
} from "@/lib/reviews";
import {
  buildBooking,
  DEFAULT_DROPOFF,
  type Booking,
  type BookingStatus,
} from "@/lib/bookings";

const ride = (over: Partial<Booking> = {}): Booking => ({
  ...buildBooking({
    driverId: "jeremy-driver",
    clientId: "client-1",
    clientName: "Sophie Legrand",
    hours: 3,
    total: 360,
    when: "2026-07-01T10:00",
  }),
  ...over,
});

const done = (over: Partial<Booking> = {}) =>
  ride({ status: "completed", ...over });

describe("reviews — autorisation (le cœur du « certifié »)", () => {
  it("autorise le client d'une course terminée", () => {
    expect(canReviewBooking(done(), "client-1").ok).toBe(true);
  });

  it("refuse une course non terminée, quel que soit son statut", () => {
    const statuses: BookingStatus[] = [
      "pending",
      "confirmed",
      "refused",
      "paid",
      "cancelled",
    ];
    for (const status of statuses) {
      const v = canReviewBooking(ride({ status }), "client-1");
      expect(v.ok, status).toBe(false);
      expect(v.reason, status).toBe("not-completed");
    }
  });

  it("refuse un autre client que celui de la course", () => {
    const v = canReviewBooking(done(), "client-2");
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("not-yours");
  });

  it("refuse une identité vide — pas d'avis anonyme", () => {
    expect(canReviewBooking(done(), "").reason).toBe("not-yours");
  });

  it("refuse une réservation inconnue", () => {
    expect(canReviewBooking(undefined, "client-1").reason).toBe("not-found");
  });

  it("n'autorise qu'un seul avis par course", () => {
    const b = done();
    const v = canReviewBooking(b, "client-1", [{ bookingId: b.id }]);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("already-reviewed");
  });

  it("laisse passer un avis sur une AUTRE course du même client", () => {
    const b = done();
    expect(canReviewBooking(b, "client-1", [{ bookingId: "autre" }]).ok).toBe(true);
  });

  it("a un message pour chaque refus", () => {
    for (const r of [
      "not-found",
      "not-yours",
      "not-completed",
      "already-reviewed",
    ] as const) {
      expect(refusalMessage(r).length, r).toBeGreaterThan(0);
    }
  });
});

describe("reviews — validation de la saisie", () => {
  const ok = "Course impeccable, chauffeur très ponctuel.";

  it("accepte une note entière de 1 à 5 avec un commentaire suffisant", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      expect(reviewError(n, ok), String(n)).toBeNull();
    }
  });

  it("refuse une note hors bornes ou non entière", () => {
    expect(reviewError(0, ok)).toBeTruthy();
    expect(reviewError(6, ok)).toBeTruthy();
    expect(reviewError(4.5, ok)).toBeTruthy();
    expect(reviewError(NaN, ok)).toBeTruthy();
  });

  it("refuse un commentaire trop court, espaces non comptés", () => {
    expect(reviewError(5, "Top")).toContain("10 caractères");
    expect(reviewError(5, "         ")).toContain("10 caractères");
  });

  it("refuse un commentaire trop long", () => {
    expect(reviewError(5, "a".repeat(REVIEW_MAX_COMMENT + 1))).toContain("500");
  });
});

describe("reviews — construction", () => {
  it("masque le nom de famille", () => {
    expect(maskAuthorName("Sophie Legrand")).toBe("Sophie L.");
    expect(maskAuthorName("Jean-Pierre Martin Dupont")).toBe("Jean-Pierre D.");
    expect(maskAuthorName("Sophie")).toBe("Sophie");
    expect(maskAuthorName("   ")).toBe("Client");
  });

  it("tronque le commentaire au maximum autorisé", () => {
    const r = buildReview({
      bookingId: "b1",
      driverId: "d1",
      clientId: "c1",
      clientName: "Sophie Legrand",
      rating: 5,
      comment: "a".repeat(600),
    });
    expect(r.comment).toHaveLength(REVIEW_MAX_COMMENT);
  });

  it("garde le lien vers la course et l'auteur", () => {
    const r = buildReview(
      {
        bookingId: "b1",
        driverId: "d1",
        clientId: "c1",
        clientName: "Sophie Legrand",
        rating: 5,
        comment: "Très bonne course, merci.",
        trip: "CDG → Le Marais",
      },
      () => "rv-1",
      () => 1000
    );
    expect(r).toMatchObject({
      id: "rv-1",
      bookingId: "b1",
      clientId: "c1",
      author: "Sophie L.",
      trip: "CDG → Le Marais",
      createdAt: 1000,
    });
  });

  it("dérive le trajet de la course, jamais de la saisie", () => {
    const transfer = done({ unit: "transfer", transfer: "ory-paris" });
    expect(tripLabelFromBooking(transfer)).toBe("Orly (ORY) → Paris · Île-de-France");
    const classic = done({ pickup: "CDG", dropoff: "Le Marais" });
    expect(tripLabelFromBooking(classic)).toBe("CDG → Le Marais");
  });

  it("n'affiche pas les libellés par défaut comme un trajet certifié", () => {
    // Le tunnel ne collecte pas encore d'adresses : buildBooking pose des
    // placeholders, qui ne doivent surtout pas être publiés comme un trajet.
    expect(tripLabelFromBooking(done())).toBe("");
    expect(
      tripLabelFromBooking(done({ pickup: "CDG", dropoff: DEFAULT_DROPOFF }))
    ).toBe("");
  });
});

describe("reviews — agrégation de la note", () => {
  const r = (rating: number) => ({ rating });

  it("calcule la moyenne et le total sans historique", () => {
    const s = ratingSummary([r(5), r(4), r(3)]);
    expect(s.average).toBe(4);
    expect(s.count).toBe(3);
  });

  it("pondère par l'historique : un avis ne renverse pas une réputation", () => {
    const s = ratingSummary([r(1)], { average: 5, count: 199 });
    expect(s.count).toBe(200);
    expect(s.average).toBe(4.98);
  });

  it("répartit les étoiles sur les avis réellement listés", () => {
    const s = ratingSummary([r(5), r(5), r(4), r(1)], { average: 5, count: 100 });
    const byStar = Object.fromEntries(s.distribution.map((d) => [d.stars, d.pct]));
    expect(byStar[5]).toBe(50);
    expect(byStar[4]).toBe(25);
    expect(byStar[1]).toBe(25);
    expect(byStar[3]).toBe(0);
  });

  it("ignore les notes aberrantes", () => {
    expect(ratingSummary([r(5), r(9), r(0)]).count).toBe(1);
  });

  it("ne divise pas par zéro sans aucun avis", () => {
    const s = ratingSummary([]);
    expect(s.average).toBe(0);
    expect(s.count).toBe(0);
    expect(s.distribution.every((d) => d.pct === 0)).toBe(true);
  });
});

describe("reviews — ancienneté affichée", () => {
  const now = new Date("2026-07-10T12:00:00").getTime();
  const ago = (ms: number) => now - ms;
  const MIN = 60_000;
  const H = 60 * MIN;
  const D = 24 * H;

  it("formate en français", () => {
    expect(formatReviewAge(ago(5 * MIN), now)).toBe("Il y a 5 minutes");
    expect(formatReviewAge(ago(3 * H), now)).toBe("Il y a 3 heures");
    expect(formatReviewAge(ago(D), now)).toBe("Hier");
    expect(formatReviewAge(ago(3 * D), now)).toBe("Il y a 3 jours");
    expect(formatReviewAge(ago(60 * D), now)).toBe("Il y a 2 mois");
    expect(formatReviewAge(ago(400 * D), now)).toBe("Il y a 1 an");
  });

  it("formate en anglais", () => {
    expect(formatReviewAge(ago(3 * D), now, "en")).toBe("3 days ago");
    expect(formatReviewAge(ago(D), now, "en")).toBe("Yesterday");
  });

  it("n'affiche jamais une date future comme négative", () => {
    expect(formatReviewAge(now + 10 * D, now)).toBe("Il y a 1 minute");
  });
});
