import { describe, it, expect, beforeEach } from "vitest";
import {
  isValidRoom,
  sanitizeText,
  rateLimit,
  MAX_MESSAGE_LEN,
} from "@/lib/validation";

describe("validation — rooms de conversation", () => {
  it("accepte des noms de room valides", () => {
    expect(isValidRoom("salon-demo")).toBe(true);
    expect(isValidRoom("dm-jeremy-driver")).toBe(true);
    expect(isValidRoom("a")).toBe(true);
  });

  it("rejette les tentatives d'injection / traversal", () => {
    expect(isValidRoom("../etc")).toBe(false);
    expect(isValidRoom("<script>")).toBe(false);
    expect(isValidRoom("a/b")).toBe(false);
    expect(isValidRoom("")).toBe(false);
    expect(isValidRoom("a".repeat(41))).toBe(false); // trop long
  });
});

describe("validation — sanitisation du texte", () => {
  it("retire les espaces superflus", () => {
    expect(sanitizeText("  bonjour  ", 100)).toBe("bonjour");
  });

  it("supprime les caractères de contrôle", () => {
    expect(sanitizeText("a\u0000b\u0007c", 100)).toBe("abc");
  });

  it("tronque à la longueur max", () => {
    const long = "x".repeat(MAX_MESSAGE_LEN + 50);
    expect(sanitizeText(long, MAX_MESSAGE_LEN).length).toBe(MAX_MESSAGE_LEN);
  });

  it("renvoie une chaîne vide pour une entrée non-string", () => {
    expect(sanitizeText(123, 100)).toBe("");
    expect(sanitizeText(null, 100)).toBe("");
    expect(sanitizeText(undefined, 100)).toBe("");
  });
});

describe("validation — rate limiting", () => {
  beforeEach(() => {
    // namespace unique par test via la clé
  });

  it("autorise sous la limite puis bloque au-delà", () => {
    const key = `t-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(rateLimit(key, 5, 10_000).ok).toBe(true);
    }
    const blocked = rateLimit(key, 5, 10_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("isole les clés différentes", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    rateLimit(a, 1, 10_000);
    expect(rateLimit(a, 1, 10_000).ok).toBe(false);
    expect(rateLimit(b, 1, 10_000).ok).toBe(true); // b non affecté
  });

  it("réinitialise après expiration de la fenêtre", async () => {
    const key = `w-${Math.random()}`;
    expect(rateLimit(key, 1, 20).ok).toBe(true);
    expect(rateLimit(key, 1, 20).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 30));
    expect(rateLimit(key, 1, 20).ok).toBe(true);
  });
});
