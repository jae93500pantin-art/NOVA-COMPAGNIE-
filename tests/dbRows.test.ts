import { describe, it, expect } from "vitest";
import {
  bookingToRow,
  messageToRow,
  reviewToRow,
  rowToBooking,
  rowToMessage,
  rowToReview,
  type BookingRow,
  type MessageRow,
  type ReviewRow,
} from "@/lib/dbRows";
import type { Booking } from "@/lib/bookings";
import type { CertifiedReview } from "@/lib/reviews";
import type { ChatMessage } from "@/lib/chat";

/**
 * La traduction entre Postgres et le domaine est l'endroit où une couche de
 * persistance se casse en silence : un type qui ne revient pas comme il est
 * parti, un fuseau qui décale une heure, une valeur d'enum inconnue. Rien de
 * tout cela ne lève d'exception — ça donne juste un écran faux.
 */

const ROW: BookingRow = {
  id: "8f14e45f-ceea-467a-9575-000000000001",
  client_id: "0d2b1f52-0000-0000-0000-000000000002",
  driver_slug: "jeremy-driver",
  client_name: "Sophie Martin",
  client_email: "sophie@example.com",
  hours: 3,
  unit: "hour",
  transfer: null,
  total: "360.00",
  pickup: "12 rue de Rivoli",
  dropoff: "Orly",
  when_local: "2026-09-12T14:30",
  status: "confirmed",
  created_at: "2026-09-09T08:00:00+00:00",
};

describe("rowToBooking", () => {
  it("convertit `numeric` en nombre", () => {
    // PostgREST renvoie numeric en CHAÎNE. Recopié tel quel, le total casse
    // toute comparaison et s'affiche « 360.00 € » au lieu de « 360 € ».
    const b = rowToBooking(ROW);
    expect(b.total).toBe(360);
    expect(typeof b.total).toBe("number");
  });

  it("expose le chauffeur par son slug d'annuaire", () => {
    expect(rowToBooking(ROW).driverId).toBe("jeremy-driver");
  });

  it("rend l'heure de prise en charge telle qu'elle a été saisie", () => {
    // Pas de conversion de fuseau : « 14:30 » doit rester « 14:30 », sinon
    // l'heure affichée dérive selon le serveur qui répond.
    expect(rowToBooking(ROW).when).toBe("2026-09-12T14:30");
  });

  it("ramène un statut inconnu à `pending`", () => {
    // Base plus récente que le code : mieux vaut un défaut sûr qu'un statut
    // que ni la machine à états ni l'affichage ne savent traiter.
    const b = rowToBooking({ ...ROW, status: "escrowed" });
    expect(b.status).toBe("pending");
  });

  it("ramène une unité inconnue à l'heure", () => {
    expect(rowToBooking({ ...ROW, unit: "week" }).unit).toBe("hour");
  });

  it("survit aux colonnes nulles", () => {
    const b = rowToBooking({
      ...ROW,
      driver_slug: null,
      client_name: null,
      client_email: null,
      hours: null,
      total: null,
      pickup: null,
      dropoff: null,
      when_local: null,
      status: null,
      unit: null,
    });
    expect(b.clientName).toBe("Client");
    expect(b.hours).toBe(1);
    expect(b.total).toBe(0);
    expect(b.when).toBe("");
  });

  it("ne produit jamais NaN sur un nombre illisible", () => {
    const b = rowToBooking({ ...ROW, total: "pas un nombre", hours: "" });
    expect(b.total).toBe(0);
    expect(b.hours).toBe(1);
  });
});

describe("bookingToRow", () => {
  const booking: Booking = rowToBooking(ROW);

  it("n'envoie ni id ni date de création : Postgres les produit", () => {
    // Deux générateurs d'identifiants concurrents finiraient par désigner la
    // même course sous deux ids, et le chat comme les avis s'y rattachent.
    const row = bookingToRow(booking);
    expect(row).not.toHaveProperty("id");
    expect(row).not.toHaveProperty("created_at");
  });

  it("fait l'aller-retour sans rien perdre", () => {
    const row = bookingToRow(booking);
    const back = rowToBooking({
      ...(row as unknown as BookingRow),
      id: ROW.id,
      created_at: ROW.created_at,
    });
    expect(back).toEqual(booking);
  });

  it("dérive start_at de l'heure saisie, pour le tri seulement", () => {
    const row = bookingToRow(booking);
    expect(row.start_at).not.toBeNull();
    // La chaîne d'origine reste la référence.
    expect(row.when_local).toBe("2026-09-12T14:30");
  });

  it("écrit `null` plutôt qu'une destination absente", () => {
    expect(bookingToRow({ ...booking, transfer: undefined }).transfer).toBeNull();
  });
});

describe("rowToMessage", () => {
  const parties = { clientId: "client-uuid", driverId: "jeremy-driver" };
  const row: MessageRow = {
    id: "msg-uuid",
    booking_id: ROW.id,
    sender_id: "compte-uuid",
    sender_role: "driver",
    sender_name: "Jérémy Dubois",
    body: "Je suis devant le terminal 2.",
    created_at: ROW.created_at,
  };

  it("expose l'id de la partie, pas celui du compte", () => {
    // `BookingChat` compare senderId aux ids de la réservation pour savoir
    // quelles bulles sont les siennes : rendre le compte casserait l'affichage.
    expect(rowToMessage(row, parties).senderId).toBe("jeremy-driver");
    expect(
      rowToMessage({ ...row, sender_role: "client" }, parties).senderId
    ).toBe("client-uuid");
  });

  it("ramène un rôle inconnu à `client`", () => {
    expect(rowToMessage({ ...row, sender_role: null }, parties).role).toBe(
      "client"
    );
  });

  it("conserve le compte auteur à l'écriture", () => {
    const message: ChatMessage = rowToMessage(row, parties);
    // Le slug d'un chauffeur peut changer ; son compte, non.
    expect(messageToRow(message, "compte-uuid").sender_id).toBe("compte-uuid");
    expect(messageToRow(message, "compte-uuid").sender_role).toBe("driver");
  });
});

describe("rowToReview", () => {
  const row: ReviewRow = {
    id: "review-uuid",
    driver_slug: "jeremy-driver",
    author_id: "compte-uuid",
    author_name: "Sophie M.",
    booking_id: ROW.id,
    rating: "4.5",
    comment: "Ponctuel et très professionnel.",
    trip: "Orly (ORY) → Paris",
    created_at: ROW.created_at,
  };

  it("convertit la note `numeric` en nombre", () => {
    expect(rowToReview(row).rating).toBe(4.5);
  });

  it("rattache l'avis à sa course, la preuve qu'il est certifié", () => {
    expect(rowToReview(row).bookingId).toBe(ROW.id);
  });

  it("fait l'aller-retour sans rien perdre", () => {
    const review: CertifiedReview = rowToReview(row);
    const back = rowToReview({
      ...(reviewToRow(review) as unknown as ReviewRow),
      id: row.id,
      created_at: row.created_at,
    });
    expect(back).toEqual(review);
  });
});
