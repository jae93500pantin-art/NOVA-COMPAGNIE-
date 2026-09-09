import { describe, it, expect } from "vitest";
import {
  buildBooking,
  canTransition,
  statusLabel,
  composeWhen,
  isFutureBooking,
  rollPastTimeToNextDay,
  formatWhen,
  todayISODate,
  bookingStartsAt,
  shouldAutoComplete,
  AUTO_COMPLETE_AFTER_MS,
  bookingDurationMs,
  isRideInProgress,
  driverPresence,
  TRANSFER_DURATION_MS,
  type Booking,
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
  it("permet à l'acceptation d'encaisser directement les fonds autorisés", () => {
    // Le paiement est autorisé dès la demande (capture manuelle) : accepter
    // capture, il n'y a plus d'étape « à payer » intermédiaire.
    expect(canTransition("pending", "paid")).toBe(true);
  });

  it("interdit de payer une course refusée", () => {
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
    expect(statusLabel("pending")).toBe("En attente — montant bloqué");
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
  it("crée une réservation et la liste pour le chauffeur", async () => {
    const driverId = `d-${Math.random()}`;
    const b = await createBooking({ driverId, clientId: "c1", clientName: "Sophie", hours: 3, total: 300 });
    expect(await listBookings(driverId)).toHaveLength(1);
    expect((await listBookings(driverId))[0].id).toBe(b.id);
  });

  it("notifie les abonnés à la création et au changement de statut", async () => {
    const driverId = `d-${Math.random()}`;
    const events: BookingEvent[] = [];
    const unsub = await subscribeBookings(driverId, (e) => events.push(e));
    // snapshot initial
    expect(events[0].type).toBe("snapshot");

    const b = await createBooking({ driverId, clientId: "c1", clientName: "Sophie", hours: 2, total: 200 });
    expect(events.some((e) => e.type === "booking")).toBe(true);

    await updateBookingStatus(driverId, b.id, "confirmed");
    const statusEvt = events.find((e) => e.type === "status");
    expect(statusEvt).toBeTruthy();
    if (statusEvt && statusEvt.type === "status") {
      expect(statusEvt.booking.status).toBe("confirmed");
    }
    unsub();
  });

  it("refuse une transition invalide", async () => {
    const driverId = `d-${Math.random()}`;
    const b = await createBooking({ driverId, clientId: "c1", clientName: "X", hours: 1, total: 50 });
    expect(await updateBookingStatus(driverId, b.id, "confirmed")).not.toBeNull();
    // confirmée → on peut payer, mais plus refuser
    expect(await updateBookingStatus(driverId, b.id, "refused")).toBeNull();
    expect(await updateBookingStatus(driverId, b.id, "paid")).not.toBeNull();
  });

  it("retourne null pour une réservation inconnue", async () => {
    expect(await updateBookingStatus("ghost", "nope", "confirmed")).toBeNull();
  });

  it("n'envoie plus d'événement après désabonnement", async () => {
    const driverId = `d-${Math.random()}`;
    const events: BookingEvent[] = [];
    const unsub = await subscribeBookings(driverId, (e) => events.push(e));
    unsub();
    await createBooking({ driverId, clientId: "c", clientName: "X", hours: 1, total: 10 });
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

  it("rollPastTimeToNextDay reporte à demain une heure déjà passée aujourd'hui", () => {
    // 1er juillet 12:00 — 09:00 est passé, on garde l'heure et on change de jour.
    expect(rollPastTimeToNextDay("2026-07-01", "09:00", now)).toEqual({
      date: "2026-07-02",
      rolled: true,
    });
  });

  it("rollPastTimeToNextDay ne touche pas à un créneau encore valable", () => {
    expect(rollPastTimeToNextDay("2026-07-01", "14:00", now)).toEqual({
      date: "2026-07-01",
      rolled: false,
    });
    expect(rollPastTimeToNextDay("2026-07-15", "09:00", now)).toEqual({
      date: "2026-07-15",
      rolled: false,
    });
  });

  it("rollPastTimeToNextDay laisse passer une date passée ou une saisie incomplète", () => {
    // Un jour révolu n'est pas un oubli d'heure : isFutureBooking doit le refuser.
    expect(rollPastTimeToNextDay("2026-06-30", "09:00", now)).toEqual({
      date: "2026-06-30",
      rolled: false,
    });
    expect(rollPastTimeToNextDay("2026-07-01", "", now)).toEqual({
      date: "2026-07-01",
      rolled: false,
    });
    expect(rollPastTimeToNextDay("", "09:00", now)).toEqual({
      date: "",
      rolled: false,
    });
  });

  it("rollPastTimeToNextDay franchit correctement fin de mois et fin d'année", () => {
    const endOfMonth = () => new Date("2026-07-31T23:00:00").getTime();
    expect(rollPastTimeToNextDay("2026-07-31", "08:00", endOfMonth).date).toBe(
      "2026-08-01"
    );
    const newYearEve = () => new Date("2026-12-31T23:00:00").getTime();
    expect(rollPastTimeToNextDay("2026-12-31", "08:00", newYearEve).date).toBe(
      "2027-01-01"
    );
  });

  it("le créneau reporté redevient valide pour isFutureBooking", () => {
    const { date } = rollPastTimeToNextDay("2026-07-01", "09:00", now);
    expect(isFutureBooking(date, "09:00", now)).toBe(true);
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

describe("bookings — statut « En course » dérivé", () => {
  const NOW = new Date("2026-07-01T12:00:00").getTime();
  const ride = (over: Partial<Booking> = {}): Booking =>
    buildBooking({
      driverId: "jeremy-driver",
      clientId: "c1",
      clientName: "Client",
      hours: 3,
      total: 300,
      when: "2026-07-01T11:00",
      ...over,
    } as never);

  const paid = (b: Booking): Booking => ({ ...b, status: "paid" });

  it("calcule la durée selon l'unité", () => {
    expect(bookingDurationMs(ride())).toBe(3 * 3600_000);
    expect(bookingDurationMs(ride({ unit: "day", hours: 2 }))).toBe(48 * 3600_000);
    expect(bookingDurationMs(ride({ unit: "transfer", hours: 1 }))).toBe(
      TRANSFER_DURATION_MS
    );
  });

  it("est en course entre le début et la fin", () => {
    const b = paid(ride()); // 11:00 → 14:00
    expect(isRideInProgress(b, NOW)).toBe(true);
  });

  it("n'est pas en course avant le début ni après la fin", () => {
    const b = paid(ride({ when: "2026-07-01T15:00" }));
    expect(isRideInProgress(b, NOW)).toBe(false);
    const past = paid(ride({ when: "2026-07-01T06:00" })); // finie à 09:00
    expect(isRideInProgress(past, NOW)).toBe(false);
  });

  it("ignore une course non payée, même à l'heure dite", () => {
    for (const status of ["pending", "confirmed", "refused", "completed", "cancelled"] as const) {
      const b = { ...ride(), status };
      expect(isRideInProgress(b, NOW), status).toBe(false);
    }
  });

  it("« En course » prime sur le statut manuel", () => {
    const b = paid(ride());
    expect(driverPresence([b], true, NOW)).toBe("in_ride");
    // même si le chauffeur s'est mis hors ligne
    expect(driverPresence([b], false, NOW)).toBe("in_ride");
  });

  it("retombe sur le statut manuel hors course", () => {
    const later = paid(ride({ when: "2026-07-01T20:00" }));
    expect(driverPresence([later], true, NOW)).toBe("online");
    expect(driverPresence([later], false, NOW)).toBe("offline");
    expect(driverPresence([], true, NOW)).toBe("online");
  });
});
