import { describe, it, expect, beforeEach } from "vitest";
import {
  getConsent,
  saveConsent,
  clearConsent,
  CONSENT_VERSION,
} from "@/lib/consent";

describe("consent — RGPD", () => {
  beforeEach(() => localStorage.clear());

  it("n'a aucun consentement au départ", () => {
    expect(getConsent()).toBeNull();
  });

  it("enregistre un choix avec version + horodatage", () => {
    const state = saveConsent({ analytics: true, marketing: false });
    expect(state.necessary).toBe(true);
    expect(state.analytics).toBe(true);
    expect(state.marketing).toBe(false);
    expect(state.version).toBe(CONSENT_VERSION);
    expect(new Date(state.date).toString()).not.toBe("Invalid Date");
  });

  it("relit le consentement enregistré", () => {
    saveConsent({ analytics: false, marketing: true });
    const c = getConsent();
    expect(c?.marketing).toBe(true);
    expect(c?.analytics).toBe(false);
  });

  it("ignore un consentement d'une version obsolète", () => {
    localStorage.setItem(
      "lumecar_consent",
      JSON.stringify({ version: 0, necessary: true, analytics: true })
    );
    expect(getConsent()).toBeNull(); // version différente → re-demande
  });

  it("efface le consentement (droit de retrait)", () => {
    saveConsent({ analytics: true, marketing: true });
    clearConsent();
    expect(getConsent()).toBeNull();
  });

  it("le strictement nécessaire est toujours actif", () => {
    const state = saveConsent({ analytics: false, marketing: false });
    expect(state.necessary).toBe(true);
  });
});
