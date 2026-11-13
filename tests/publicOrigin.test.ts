import { describe, expect, it } from "vitest";
import { publicOrigin } from "@/lib/publicOrigin";

const req = (url: string, headers: Record<string, string> = {}) => ({
  url,
  headers: new Headers(headers),
});

describe("publicOrigin", () => {
  it("suit x-forwarded-host / x-forwarded-proto (Caddy sur Azure)", () => {
    expect(
      publicOrigin(
        req("http://127.0.0.1:3000/api/auth/reset", {
          "x-forwarded-host": "novacompagnie.com",
          "x-forwarded-proto": "https",
        })
      )
    ).toBe("https://novacompagnie.com");
  });

  it("retombe sur Host quand le proxy ne pose pas x-forwarded-host (Render)", () => {
    expect(
      publicOrigin(
        req("http://localhost:10000/api/auth/reset", {
          host: "novacompagnie.com",
          "x-forwarded-proto": "https",
        })
      )
    ).toBe("https://novacompagnie.com");
  });

  it("ne garde que la première valeur d'un en-tête à plusieurs entrées", () => {
    expect(
      publicOrigin(
        req("http://localhost:10000/", {
          "x-forwarded-host": "novacompagnie.com, interne",
          "x-forwarded-proto": "https,http",
        })
      )
    ).toBe("https://novacompagnie.com");
  });

  it("garde l'URL telle quelle en local, sans proxy", () => {
    expect(publicOrigin(req("http://localhost:3000/auth/callback"))).toBe(
      "http://localhost:3000"
    );
  });
});
