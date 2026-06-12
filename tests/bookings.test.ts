import { describe, it, expect } from "vitest";
import {
  buildBooking,
  canTransition,
  statusLabel,
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
  it("a un libellé pour chaque statut", () => {
    expect(statusLabel("pending")).toBe("En attente");
    expect(statusLabel("confirmed")).toBe("Acceptée — à payer");
    expect(statusLabel("refused")).toBe("Refusée");
    expect(statusLabel("paid")).toBe("Payée");
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
