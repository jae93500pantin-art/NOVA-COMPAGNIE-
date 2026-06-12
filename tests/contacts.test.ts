import { describe, it, expect, beforeEach } from "vitest";
import { roomForDriver, getContacts, addContact } from "@/lib/contacts";

describe("contacts — conversations client↔chauffeur", () => {
  beforeEach(() => localStorage.clear());

  it("génère une room déterministe par chauffeur", () => {
    expect(roomForDriver("jeremy-driver")).toBe("dm-jeremy-driver");
    expect(roomForDriver("alexandre-moreau")).toBe("dm-alexandre-moreau");
    // déterministe : deux appels identiques → même room
    expect(roomForDriver("x")).toBe(roomForDriver("x"));
  });

  it("démarre sans contact", () => {
    expect(getContacts()).toEqual([]);
  });

  it("ajoute un contact et le retrouve", () => {
    addContact("jeremy-driver");
    expect(getContacts()).toContain("jeremy-driver");
  });

  it("ne crée pas de doublon", () => {
    addContact("jeremy-driver");
    addContact("jeremy-driver");
    expect(getContacts().filter((c) => c === "jeremy-driver")).toHaveLength(1);
  });

  it("place le contact le plus récent en tête", () => {
    addContact("alexandre-moreau");
    addContact("jeremy-driver");
    expect(getContacts()[0]).toBe("jeremy-driver");
  });
});
