import { describe, it, expect } from "vitest";
import {
  buildBooking,
  canTransition,
  statusLabel,
  composeWhen,
  isFutureBooking,
  formatWhen,
  todayISODate,
  bookingStartsAt,
  shouldAutoComplete,
  AUTO_COMPLETE_AFTER_MS,
} from "@/lib/bookings";
import {
  createBooking,
  listBookings,
  updateBookingStatus,
  subscribeBookings,
  type BookingEvent,
} from "@/lib/bookingBroker";

describe("bookings — transitions de statut", () => {
  it("autorise pending → confirmed/refused", () => {
    expect(canTransition("pending", "confirmed")).toBe(true);
    expect(canTransition("pending", "refused")).toBe(true);
  });
  it("autorise confirmed → paid (paiement après acceptation)", () => {
    expect(canTransition("confirmed", "paid")).toBe(true);
  });
  it("interdit de payer une course non acceptée", () => {
    expect(canTransition("pending", "paid")).toBe(false);
    expect(canTransition("refused", "paid")).toBe(false);
  });
  it("interdit toute transition depuis un état final", () => {
    expect(canTransition("refused", "confirmed")).toBe(false);
    expect(canTransition("paid", "confirmed")).toBe(false);
    expect(canTransition("confirmed", "pending")).toBe(false);
  });
  it("autorise paid → completed (course effectuée)", () => {
    expect(canTransition("paid", "completed")).toBe(true);
  });
  it("autorise l'annulation tant que la course n'est pas close", () => {
    expect(canTransition("pending", "cancelled")).toBe(true);
    expect(canTransition("confirmed", "cancelled")).toBe(true);
    expect(canTransition("paid", "cancelled")).toBe(true);
  });
  it("interdit de terminer une course non payée", () => {
    expect(canTransition("pending", "completed")).toBe(false);
    expect(canTransition("confirmed", "completed")).toBe(false);
  });
  it("interdit toute transition depuis completed/cancelled", () => {
    expect(canTransition("completed", "paid")).toBe(false);
    expect(canTransition("cancelled", "paid")).toBe(false);
    expect(canTransition("completed", "cancelled")).toBe(false);
  });
  it("a un libellé pour chaque statut", () => {
    expect(statusLabel("pending")).toBe("En attente");
    expect(statusLabel("confirmed")).toBe("Acceptée — à payer");
    expect(statusLabel("refused")).toBe("Refusée");
    expect(statusLabel("paid")).toBe("Payée");
    expect(statusLabel("completed")).toBe("Terminée");
    expect(statusLabel("cancelled")).toBe("Annulée");
  });
});

describe("bookings — clôture automatique après 24 h", () => {
  const base = buildBooking({
    driverId: "jeremy-driver",
    clientId: "c1",
    clientName: "Alice",
    hours: 2,
    total: 200,
    when: "2026-08-01T14:00",
  });
  const start = new Date(2026, 7, 1, 14, 0).getTime();

  it("lit la date de course depuis `when`", () => {
    expect(bookingStartsAt(base)).toBe(start);
  });
  it("retombe sur createdAt sans date exploitable", () => {
    expect(bookingStartsAt({ ...base, when: "" })).toBe(base.createdAt);
    expect(bookingStartsAt({ ...base, when: "dès que possible" })).toBe(base.createdAt);
  });
  it("ne clôture qu'une course payée, et seulement après 24 h", () => {
    const paid = { ...base, status: "paid" as const };
    expect(shouldAutoComplete(paid, start + AUTO_COMPLETE_AFTER_MS - 1)).toBe(false);
    expect(shouldAutoComplete(paid, start + AUTO_COMPLETE_AFTER_MS)).toBe(true);
    expect(
      shouldAutoComplete({ ...base, status: "confirmed" }, start + AUTO_COMPLETE_AFTER_MS * 5)
    ).toBe(false);
  });
});

describe("bookings — buildBooking (défauts & clamps)", () => {
  it("crée une réservation en attente avec des défauts", () => {
    const b = buildBooking({
      driverId: "jeremy-driver",
      clientId: "c1",
      clientName: "",
      hours: 0,
      total: 100.4,
    });
    expect(b.status).toBe("pending");
    expect(b.clientName).toBe("Client");
    expect(b.hours).toBe(1); // clampé
    expect(b.total).toBe(100); // arrondi
    expect(b.pickup).toBeTruthy();
  });
  it("clampe les heures à 24 max", () => {
    const b = buildBooking({ driverId: "d", clientId: "c", clientName: "X", hours: 99, total: 10 });
    expect(b.hours).toBe(24);
  });
  it("utilise les fabriques injectées (id/temps déterministes)", () => {
    const b = buildBooking(
      { driverId: "d", clientId: "c", clientName: "X", hours: 2, total: 50 },
      () => "fixed-id",
      () => 1000
    );
    expect(b.id).toBe("fixed-id");
    expect(b.createdAt).toBe(1000);
  });
});

describe("bookingBroker — création & cycle de vie", () => {
  it("crée une réservation et la liste pour le chauffeur", () => {
    const driverId = `d-${Math.random()}`;
    const b = createBooking({ driverId, clientId: "c1", clientName: "Sophie", hours: 3, total: 300 });
    expect(listBookings(driverId)).toHaveLength(1);
    expect(listBookings(driverId)[0].id).toBe(b.id);
  });

  it("notifie les abonnés à la création et au changement de statut", () => {
    const driverId = `d-${Math.random()}`;
    const events: BookingEvent[] = [];
    const unsub = subscribeBookings(driverId, (e) => events.push(e));
    // snapshot initial
    expect(events[0].type).toBe("snapshot");

    const b = createBooking({ driverId, clientId: "c1", clientName: "Sophie", hours: 2, total: 200 });
    expect(events.some((e) => e.type === "booking")).toBe(true);

    updateBookingStatus(driverId, b.id, "confirmed");
    const statusEvt = events.find((e) => e.type === "status");
    expect(statusEvt).toBeTruthy();
    if (statusEvt && statusEvt.type === "status") {
      expect(statusEvt.booking.status).toBe("confirmed");
    }
    unsub();
  });

  it("refuse une transition invalide", () => {
    const driverId = `d-${Math.random()}`;
    const b = createBooking({ driverId, clientId: "c1", clientName: "X", hours: 1, total: 50 });
    expect(updateBookingStatus(driverId, b.id, "confirmed")).not.toBeNull();
    // confirmée → on peut payer, mais plus refuser
    expect(updateBookingStatus(driverId, b.id, "refused")).toBeNull();
    expect(updateBookingStatus(driverId, b.id, "paid")).not.toBeNull();
  });

  it("retourne null pour une réservation inconnue", () => {
    expect(updateBookingStatus("ghost", "nope", "confirmed")).toBeNull();
  });

  it("n'envoie plus d'événement après désabonnement", () => {
    const driverId = `d-${Math.random()}`;
    const events: BookingEvent[] = [];
    const unsub = subscribeBookings(driverId, (e) => events.push(e));
    unsub();
    createBooking({ driverId, clientId: "c", clientName: "X", hours: 1, total: 10 });
    // seul le snapshot initial reçu
    expect(events.filter((e) => e.type === "booking")).toHaveLength(0);
  });
});

describe("bookings — planification (date exacte choisie par le client)", () => {
  const FIXED = new Date("2026-07-01T12:00:00").getTime();
  const now = () => FIXED;

  it("todayISODate renvoie la date du jour au format YYYY-MM-DD", () => {
    expect(todayISODate(now)).toBe("2026-07-01");
  });

  it("composeWhen combine date + heure en valeur ISO stockable", () => {
    expect(composeWhen("2026-07-15", "14:30")).toBe("2026-07-15T14:30");
    expect(composeWhen("2026-07-15", "")).toBe("2026-07-15");
    expect(composeWhen("", "14:30")).toBe(""); // date obligatoire
    expect(composeWhen("pas-une-date", "14:30")).toBe("");
  });

  it("isFutureBooking accepte une date future et refuse le passé", () => {
    expect(isFutureBooking("2026-07-15", "", now)).toBe(true);
    expect(isFutureBooking("2026-06-30", "", now)).toBe(false); // hier
    expect(isFutureBooking("2026-07-01", "", now)).toBe(true); // aujourd'hui (fin de journée)
  });

  it("isFutureBooking compare l'heure le jour même", () => {
    expect(isFutureBooking("2026-07-01", "14:00", now)).toBe(true); // plus tard aujourd'hui
    expect(isFutureBooking("2026-07-01", "09:00", now)).toBe(false); // déjà passé
  });

  it("isFutureBooking rejette une saisie invalide", () => {
    expect(isFutureBooking("", "", now)).toBe(false);
    expect(isFutureBooking("2026-13-40", "", now)).toBe(false);
  });

  it("formatWhen produit un libellé localisé (FR/EN)", () => {
    expect(formatWhen("2026-07-15", "fr")).toBe("15 juillet 2026");
    expect(formatWhen("2026-07-15", "en")).toBe("July 15, 2026");
    expect(formatWhen("2026-07-15T14:30", "fr")).toBe("15 juillet 2026 à 14:30");
    expect(formatWhen("2026-07-15T14:30", "en")).toBe("July 15, 2026 at 14:30");
  });

  it("formatWhen gère le cas vide (dès que possible)", () => {
    expect(formatWhen("", "fr")).toBe("Dès que possible");
    expect(formatWhen("", "en")).toBe("As soon as possible");
  });

  it("formatWhen renvoie un texte libre hérité tel quel", () => {
    expect(formatWhen("Demain matin", "fr")).toBe("Demain matin");
  });

  it("buildBooking conserve la date choisie", () => {
    const b = buildBooking({
      driverId: "d",
      clientId: "c",
      clientName: "X",
      hours: 2,
      total: 100,
      when: "2026-07-15T14:30",
    });
    expect(b.when).toBe("2026-07-15T14:30");
  });

  it("buildBooking laisse `when` vide quand non renseigné", () => {
    const b = buildBooking({ driverId: "d", clientId: "c", clientName: "X", hours: 1, total: 10 });
    expect(b.when).toBe("");
  });
});
