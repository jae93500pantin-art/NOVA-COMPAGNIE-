import { describe, it, expect } from "vitest";
import {
  CLIENT_QUICK_REPLIES,
  DRIVER_QUICK_REPLIES,
  isKnownQuickReply,
  quickRepliesFor,
} from "@/lib/chatQuickReplies";
import { dictionaries } from "@/lib/dictionaries";

describe("quickRepliesFor", () => {
  it("rend le jeu du chauffeur", () => {
    expect(quickRepliesFor("driver")).toBe(DRIVER_QUICK_REPLIES);
    expect(quickRepliesFor("driver").map((q) => q.id)).toEqual([
      "onMyWay",
      "arrived",
      "late5",
      "whereAreYou",
    ]);
  });

  it("rend le jeu du client", () => {
    expect(quickRepliesFor("client")).toBe(CLIENT_QUICK_REPLIES);
  });

  it("ne melange jamais les deux jeux", () => {
    const driverIds = DRIVER_QUICK_REPLIES.map((q) => q.id);
    for (const q of CLIENT_QUICK_REPLIES) {
      expect(driverIds).not.toContain(q.id);
    }
  });

  it("reconnait un identifiant connu, rejette le reste", () => {
    expect(isKnownQuickReply("onMyWay")).toBe(true);
    expect(isKnownQuickReply("comingDown")).toBe(true);
    expect(isKnownQuickReply("send-me-your-number")).toBe(false);
    expect(isKnownQuickReply("")).toBe(false);
  });
});

describe("libelles", () => {
  const lookup = (dict: Record<string, unknown>, key: string) =>
    key.split(".").reduce<unknown>((acc, part) => {
      if (acc && typeof acc === "object") {
        return (acc as Record<string, unknown>)[part];
      }
      return undefined;
    }, dict);

  it("chaque reponse rapide est traduite en FR et en EN", () => {
    // Le libelle EST le texte envoye : une cle manquante enverrait
    // « chat.quick.onMyWay » au client.
    for (const q of [...DRIVER_QUICK_REPLIES, ...CLIENT_QUICK_REPLIES]) {
      expect(typeof lookup(dictionaries.fr, q.key), `FR ${q.key}`).toBe("string");
      expect(typeof lookup(dictionaries.en, q.key), `EN ${q.key}`).toBe("string");
    }
  });
});
