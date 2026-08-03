import { describe, it, expect, vi } from "vitest";
import {
  chatStateFor,
  chatStateForBooking,
  canSendMessage,
  participantRole,
  buildMessage,
  formatMessageTime,
  isSameSenderAsPrevious,
  MAX_CHAT_MESSAGE_LEN,
  type ChatMessage,
} from "@/lib/chat";
import { buildBooking, AUTO_COMPLETE_AFTER_MS, type Booking } from "@/lib/bookings";
import {
  postMessage,
  listMessages,
  subscribeChat,
  closeChat,
  dropChat,
  type ChatEvent,
} from "@/lib/chatBroker";

const CLIENT = "client-abc";
const DRIVER = "jeremy-driver";

function booking(over: Partial<Booking> = {}): Booking {
  return {
    ...buildBooking({
      driverId: DRIVER,
      clientId: CLIENT,
      clientName: "Alice Martin",
      hours: 3,
      total: 300,
      when: "2026-08-01T14:00",
    }),
    ...over,
  };
}

describe("chat — ouverture du fil selon le statut de la course", () => {
  it("reste verrouillé tant que la course n'est pas payée", () => {
    expect(chatStateFor("pending")).toBe("locked");
    expect(chatStateFor("confirmed")).toBe("locked");
    expect(chatStateFor("refused")).toBe("locked");
  });

  it("s'ouvre au paiement", () => {
    expect(chatStateFor("paid")).toBe("open");
  });

  it("s'archive une fois la course terminée ou annulée", () => {
    expect(chatStateFor("completed")).toBe("archived");
    expect(chatStateFor("cancelled")).toBe("archived");
  });
});

describe("chat — clôture automatique (filet de sécurité 24 h)", () => {
  const start = new Date(2026, 7, 1, 14, 0).getTime(); // 2026-08-01T14:00 local

  it("laisse le fil ouvert pendant la course", () => {
    const b = booking({ status: "paid" });
    expect(chatStateForBooking(b, start + 60_000)).toBe("open");
    expect(canSendMessage(b, start + 60_000)).toBe(true);
  });

  it("archive 24 h après le début de la course", () => {
    const b = booking({ status: "paid" });
    expect(chatStateForBooking(b, start + AUTO_COMPLETE_AFTER_MS + 1)).toBe("archived");
    expect(canSendMessage(b, start + AUTO_COMPLETE_AFTER_MS + 1)).toBe(false);
  });

  it("n'auto-archive pas une course non payée", () => {
    const b = booking({ status: "confirmed" });
    expect(chatStateForBooking(b, start + AUTO_COMPLETE_AFTER_MS * 10)).toBe("locked");
  });

  it("se base sur createdAt quand aucune date n'est fournie", () => {
    const b = booking({ status: "paid", when: "", createdAt: 1_000_000 });
    expect(chatStateForBooking(b, 1_000_000 + 60_000)).toBe("open");
    expect(chatStateForBooking(b, 1_000_000 + AUTO_COMPLETE_AFTER_MS + 1)).toBe("archived");
  });
});

describe("chat — participants", () => {
  it("reconnaît le client et le chauffeur", () => {
    const b = booking();
    expect(participantRole(b, CLIENT)).toBe("client");
    expect(participantRole(b, DRIVER)).toBe("driver");
  });

  it("rejette un tiers ou un id vide", () => {
    const b = booking();
    expect(participantRole(b, "someone-else")).toBeNull();
    expect(participantRole(b, "")).toBeNull();
  });
});

describe("chat — construction des messages", () => {
  it("nettoie et tronque le texte", () => {
    const m = buildMessage({
      bookingId: "bk-1",
      role: "client",
      senderId: CLIENT,
      senderName: "  Alice  ",
      text: `  ${"x".repeat(MAX_CHAT_MESSAGE_LEN + 50)}  `,
    });
    expect(m.senderName).toBe("Alice");
    expect(m.text).toHaveLength(MAX_CHAT_MESSAGE_LEN);
  });

  it("retombe sur un nom par défaut selon le rôle", () => {
    expect(
      buildMessage({ bookingId: "bk-1", role: "driver", senderId: DRIVER, text: "ok" })
        .senderName
    ).toBe("Chauffeur");
    expect(
      buildMessage({ bookingId: "bk-1", role: "client", senderId: CLIENT, text: "ok" })
        .senderName
    ).toBe("Client");
  });
});

describe("chat — affichage", () => {
  it("formate l'heure en 24 h (FR) et 12 h (EN)", () => {
    const t = new Date(2026, 0, 1, 14, 5).getTime();
    expect(formatMessageTime(t, "fr")).toBe("14:05");
    expect(formatMessageTime(t, "en")).toBe("2:05 PM");
  });

  it("regroupe les messages consécutifs du même auteur", () => {
    const mk = (senderId: string): ChatMessage => ({
      id: Math.random().toString(),
      bookingId: "bk-1",
      role: "client",
      senderId,
      senderName: "x",
      text: "hi",
      createdAt: 0,
    });
    const msgs = [mk(CLIENT), mk(CLIENT), mk(DRIVER)];
    expect(isSameSenderAsPrevious(msgs, 0)).toBe(false);
    expect(isSameSenderAsPrevious(msgs, 1)).toBe(true);
    expect(isSameSenderAsPrevious(msgs, 2)).toBe(false);
  });
});

describe("chatBroker — diffusion temps réel", () => {
  it("envoie l'historique à l'abonnement puis chaque nouveau message", () => {
    const id = `bk-test-${Math.random().toString(36).slice(2)}`;
    postMessage({ bookingId: id, role: "client", senderId: CLIENT, text: "Bonjour" });

    const events: ChatEvent[] = [];
    const unsub = subscribeChat(id, (e) => events.push(e));

    expect(events[0]).toMatchObject({ type: "snapshot" });
    expect((events[0] as { messages: ChatMessage[] }).messages).toHaveLength(1);

    postMessage({ bookingId: id, role: "driver", senderId: DRIVER, text: "J'arrive" });
    expect(events[1]).toMatchObject({ type: "message" });
    expect(listMessages(id)).toHaveLength(2);

    unsub();
    postMessage({ bookingId: id, role: "client", senderId: CLIENT, text: "ignoré" });
    expect(events).toHaveLength(2); // plus d'événement après désabonnement
    dropChat(id);
  });

  it("prévient les abonnés quand la course est clôturée", () => {
    const id = `bk-test-${Math.random().toString(36).slice(2)}`;
    const fn = vi.fn();
    const unsub = subscribeChat(id, fn);
    closeChat(id);
    expect(fn).toHaveBeenLastCalledWith({ type: "closed", bookingId: id });
    unsub();
    dropChat(id);
  });

  it("conserve l'historique après clôture (archivage, pas suppression)", () => {
    const id = `bk-test-${Math.random().toString(36).slice(2)}`;
    postMessage({ bookingId: id, role: "client", senderId: CLIENT, text: "a" });
    closeChat(id);
    expect(listMessages(id)).toHaveLength(1);
    dropChat(id);
  });

  it("supprime tout le fil avec dropChat (effacement RGPD)", () => {
    const id = `bk-test-${Math.random().toString(36).slice(2)}`;
    postMessage({ bookingId: id, role: "client", senderId: CLIENT, text: "a" });
    dropChat(id);
    expect(listMessages(id)).toHaveLength(0);
  });
});
