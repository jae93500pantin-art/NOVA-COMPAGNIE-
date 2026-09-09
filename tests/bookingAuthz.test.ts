import { describe, it, expect } from "vitest";
import { bookingActor, canActOn, canTransition } from "@/lib/bookings";

const booking = { clientId: "client-1", driverId: "jeremy-driver" };

describe("bookingActor", () => {
  it("reconnaît le client par son id de session", () => {
    expect(bookingActor(booking, "client-1")).toBe("client");
  });

  it("reconnaît le chauffeur par le profil public qu'il pilote", () => {
    expect(bookingActor(booking, "compte-42", "jeremy-driver")).toBe("driver");
  });

  it("ne reconnaît personne sans identité", () => {
    expect(bookingActor(booking, null)).toBe("stranger");
    expect(bookingActor(booking, "")).toBe("stranger");
    expect(bookingActor(booking, undefined)).toBe("stranger");
  });

  it("refuse un tiers, même muni de l'id de réservation", () => {
    expect(bookingActor(booking, "client-2")).toBe("stranger");
  });

  it("refuse un chauffeur rattaché à un autre profil", () => {
    expect(bookingActor(booking, "compte-42", "autre-chauffeur")).toBe("stranger");
  });

  it("ne prend pas un slug vide pour une correspondance", () => {
    expect(bookingActor({ clientId: "c", driverId: "" }, "x", "")).toBe("stranger");
  });
});

describe("canActOn", () => {
  it("réserve accepter, refuser et terminer au chauffeur", () => {
    for (const s of ["confirmed", "refused", "completed"] as const) {
      expect(canActOn("driver", s), s).toBe(true);
      expect(canActOn("client", s), s).toBe(false);
    }
  });

  it("réserve le paiement au client — un chauffeur ne peut pas encaisser seul", () => {
    expect(canActOn("client", "paid")).toBe(true);
    expect(canActOn("driver", "paid")).toBe(false);
  });

  it("laisse les deux parties annuler", () => {
    expect(canActOn("client", "cancelled")).toBe(true);
    expect(canActOn("driver", "cancelled")).toBe(true);
  });

  it("ne laisse jamais revenir à l'état initial", () => {
    expect(canActOn("client", "pending")).toBe(false);
    expect(canActOn("driver", "pending")).toBe(false);
  });

  it("refuse tout à un tiers", () => {
    for (const s of ["confirmed", "refused", "paid", "completed", "cancelled"] as const) {
      expect(canActOn("stranger", s), s).toBe(false);
    }
  });
});

describe("les deux règles sont complémentaires", () => {
  it("une transition cohérente peut rester illégitime", () => {
    // Le cas qui motive tout : passer confirmed -> paid est valide pour la
    // machine à états, mais le chauffeur n'a pas à le faire.
    expect(canTransition("confirmed", "paid")).toBe(true);
    expect(canActOn("driver", "paid")).toBe(false);
  });

  it("une action légitime peut rester incohérente", () => {
    // Le chauffeur a le droit de terminer une course, mais pas une course
    // encore en attente.
    expect(canActOn("driver", "completed")).toBe(true);
    expect(canTransition("pending", "completed")).toBe(false);
  });
});
