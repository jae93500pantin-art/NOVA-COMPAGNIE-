import { describe, it, expect } from "vitest";
import { matchDemoAccount, demoAccounts } from "@/lib/demoAccounts";

describe("demoAccounts — authentification (création/connexion de compte démo)", () => {
  it("expose un compte client et un compte chauffeur", () => {
    expect(demoAccounts.find((a) => a.role === "client")).toBeTruthy();
    expect(demoAccounts.find((a) => a.role === "driver")).toBeTruthy();
  });

  it("connecte le client avec test/test", () => {
    const acc = matchDemoAccount("test", "test");
    expect(acc).not.toBeNull();
    expect(acc?.role).toBe("client");
  });

  it("connecte le chauffeur avec driver/driver, sans fiche publique", () => {
    const acc = matchDemoAccount("driver", "driver");
    expect(acc).not.toBeNull();
    expect(acc?.role).toBe("driver");
    // L'annuaire en dur a été vidé : ce compte ne pointe plus vers un profil
    // inventé. Il ouvre l'espace chauffeur, il ne fabrique pas de chauffeur.
    expect(acc?.driverId).toBeUndefined();
  });

  it("est insensible à la casse sur l'identifiant", () => {
    expect(matchDemoAccount("TEST", "test")).not.toBeNull();
    expect(matchDemoAccount("Driver", "driver")).not.toBeNull();
  });

  it("tolère les espaces autour de l'identifiant", () => {
    expect(matchDemoAccount("  test  ", "test")).not.toBeNull();
  });

  it("rejette un mauvais mot de passe", () => {
    expect(matchDemoAccount("test", "wrong")).toBeNull();
    expect(matchDemoAccount("driver", "")).toBeNull();
  });

  it("rejette un identifiant inconnu", () => {
    expect(matchDemoAccount("inconnu", "test")).toBeNull();
  });

  it("est sensible à la casse sur le mot de passe", () => {
    expect(matchDemoAccount("test", "TEST")).toBeNull();
  });
});
