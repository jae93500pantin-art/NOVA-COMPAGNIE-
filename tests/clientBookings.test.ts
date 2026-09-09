import { describe, it, expect, beforeEach } from "vitest";
import { clientIdOf, getClientId } from "@/lib/clientBookings";

/**
 * Quelle identité le navigateur présente-t-il comme étant celle du client ?
 *
 * Régression déjà vécue : le serveur a commencé à dériver `booking.clientId`
 * de la session, tandis que l'interface continuait à filtrer sur l'id local.
 * Résultat, un client authentifié ne voyait plus aucune de ses réservations —
 * une page vide, sans la moindre erreur.
 */
describe("clientIdOf", () => {
  beforeEach(() => localStorage.clear());

  it("prend l'id du compte quand une session réelle existe", () => {
    expect(clientIdOf({ id: "9f1c-uuid" })).toBe("9f1c-uuid");
  });

  it("retombe sur l'id de navigateur en mode démo", () => {
    // Le compte démo n'existe pas côté serveur : il n'a pas d'id.
    const id = clientIdOf({ id: undefined });
    expect(id).toBe(getClientId());
    expect(id).not.toBe("");
  });

  it("retombe sur l'id de navigateur sans session du tout", () => {
    expect(clientIdOf(null)).toBe(getClientId());
    expect(clientIdOf(undefined)).toBe(getClientId());
  });

  it("garde le même id de navigateur d'un appel à l'autre", () => {
    // Il sert de clé de filtrage : le régénérer perdrait l'historique local.
    expect(getClientId()).toBe(getClientId());
  });
});
