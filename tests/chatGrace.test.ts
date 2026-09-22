import { describe, it, expect } from "vitest";
import {
  buildMessage,
  canSendMessage,
  chatClosesAt,
  chatStateForBooking,
  CHAT_GRACE_AFTER_CLOSE_MS,
  graceMinutesLeft,
  messageDeliveryStatus,
  type ChatMessage,
} from "@/lib/chat";
import { buildBooking, AUTO_COMPLETE_AFTER_MS, type Booking } from "@/lib/bookings";

const CLIENT = "client-abc";
const DRIVER = "jeremy-driver";

/** Course prévue loin dans le futur : le filet des 24 h ne s'en mêle pas. */
function booking(over: Partial<Booking> = {}): Booking {
  return {
    ...buildBooking({
      driverId: DRIVER,
      clientId: CLIENT,
      clientName: "Alice Martin",
      hours: 3,
      total: 300,
      when: "2099-08-01T14:00",
    }),
    ...over,
  };
}

const CLOSED = 1_700_000_000_000;
const MIN = 60_000;

describe("delai de grace de 30 minutes apres la cloture", () => {
  it("laisse le fil ouvert juste apres la cloture", () => {
    const b = booking({ status: "completed", closedAt: CLOSED });
    expect(chatStateForBooking(b, CLOSED + MIN)).toBe("grace");
    expect(canSendMessage(b, CLOSED + MIN)).toBe(true);
  });

  it("le laisse ouvert jusqu'a la 30e minute", () => {
    const b = booking({ status: "completed", closedAt: CLOSED });
    expect(chatStateForBooking(b, CLOSED + 29 * MIN)).toBe("grace");
    expect(canSendMessage(b, CLOSED + 29 * MIN)).toBe(true);
  });

  it("verrouille a la 30e minute pile", () => {
    const b = booking({ status: "completed", closedAt: CLOSED });
    const deadline = CLOSED + CHAT_GRACE_AFTER_CLOSE_MS;
    expect(chatStateForBooking(b, deadline)).toBe("archived");
    expect(canSendMessage(b, deadline)).toBe(false);
    expect(canSendMessage(b, deadline + MIN)).toBe(false);
  });

  it("s'applique aussi a une course annulee", () => {
    const b = booking({ status: "cancelled", closedAt: CLOSED });
    expect(chatStateForBooking(b, CLOSED + MIN)).toBe("grace");
    expect(chatStateForBooking(b, CLOSED + 31 * MIN)).toBe("archived");
  });

  it("archive immediatement une course cloturee AVANT cette regle", () => {
    // Sans closedAt, rien ne dit depuis quand la course est close : rouvrir
    // un fil que ses deux participants croyaient clos depuis des semaines
    // serait pire que de le laisser ferme.
    const b = booking({ status: "completed" });
    expect(chatClosesAt(b)).toBeNull();
    expect(chatStateForBooking(b, Date.now())).toBe("archived");
    expect(canSendMessage(b)).toBe(false);
  });

  it("ne donne aucune echeance a une course en cours", () => {
    expect(chatClosesAt(booking({ status: "paid" }))).toBeNull();
    expect(chatClosesAt(booking({ status: "pending" }))).toBeNull();
  });

  it("compte les minutes restantes, arrondies vers le haut", () => {
    const b = booking({ status: "completed", closedAt: CLOSED });
    expect(graceMinutesLeft(b, CLOSED)).toBe(30);
    expect(graceMinutesLeft(b, CLOSED + 10 * MIN)).toBe(20);
    // 30 s restantes s'affichent « 1 min », jamais « 0 min » alors qu'on peut
    // encore ecrire.
    expect(graceMinutesLeft(b, CLOSED + 29 * MIN + 30_000)).toBe(1);
    expect(graceMinutesLeft(b, CLOSED + CHAT_GRACE_AFTER_CLOSE_MS)).toBe(0);
  });

  it("le filet des 24 h l'emporte sur le delai de grace", () => {
    // Course payee que personne n'a cloturee : elle est archivee d'office,
    // et il n'y a aucune raison de rouvrir 30 minutes d'ecriture.
    const past = booking({ status: "paid", when: "2020-01-01T10:00" });
    const late = new Date("2020-01-02T11:00").getTime() + AUTO_COMPLETE_AFTER_MS;
    expect(chatStateForBooking(past, late)).toBe("archived");
    expect(canSendMessage(past, late)).toBe(false);
  });
});

describe("buildMessage — masquage a la source", () => {
  const make = (text: string) =>
    buildMessage({ bookingId: "bk-1", role: "client", senderId: CLIENT, text });

  it("retire un numero de telephone et le signale", () => {
    const m = make("appelle moi au 06 12 34 56 78");
    expect(m.text).toBe("appelle moi au ***");
    expect(m.masked).toBe(true);
  });

  it("retire une adresse e-mail", () => {
    expect(make("ecris a jean@example.com").text).toBe("ecris a ***");
  });

  it("ne signale rien sur un message ordinaire", () => {
    const m = make("Je suis devant le terminal 2E, porte 8");
    expect(m.text).toBe("Je suis devant le terminal 2E, porte 8");
    expect(m.masked).toBe(false);
  });

  it("porte le drapeau de reponse rapide", () => {
    const quick = buildMessage({
      bookingId: "bk-1",
      role: "driver",
      senderId: DRIVER,
      text: "En route",
      isQuickReply: true,
    });
    expect(quick.isQuickReply).toBe(true);
    expect(make("En route").isQuickReply).toBe(false);
  });
});

describe("accuses de remise et de lecture", () => {
  const base: ChatMessage = {
    id: "m1",
    bookingId: "bk-1",
    role: "driver",
    senderId: DRIVER,
    senderName: "Jeremy",
    text: "En route",
    createdAt: CLOSED,
  };

  it("part de « envoye »", () => {
    expect(messageDeliveryStatus(base)).toBe("sent");
  });

  it("passe a « remis » quand le destinataire ecoutait", () => {
    expect(messageDeliveryStatus({ ...base, deliveredAt: CLOSED })).toBe(
      "delivered"
    );
  });

  it("passe a « lu », qui l'emporte sur « remis »", () => {
    expect(
      messageDeliveryStatus({ ...base, deliveredAt: CLOSED, readAt: CLOSED })
    ).toBe("read");
    // Un « lu » sans « remis » ne devrait pas arriver, mais s'il arrive il ne
    // doit pas retrograder l'affichage.
    expect(messageDeliveryStatus({ ...base, readAt: CLOSED })).toBe("read");
  });
});
