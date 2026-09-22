import { describe, it, expect } from "vitest";
import {
  driverFullName,
  formatIssuedAt,
  formatSiren,
  formatVoucherWhen,
  isValidSiren,
  missingVoucherFields,
  voucherNumber,
  VOUCHER_FIELD_LABELS,
  type BookingVoucher,
} from "@/lib/bookingVoucher";
import { DEFAULT_DROPOFF, DEFAULT_PICKUP } from "@/lib/bookings";

/** Un bon complet, dont chaque test retire ce qu'il veut éprouver. */
function voucher(patch: Partial<BookingVoucher> = {}): BookingVoucher {
  return {
    number: "NOVA-2026-A3F9K",
    issuedAt: Date.parse("2026-01-12T09:30:00"),
    driver: {
      firstName: "Jérémy",
      lastName: "Dubois",
      siret: "552100554",
      vtcCardNumber: "VTC-075-2024-000123",
      plate: "AB-123-CD",
    },
    client: { name: "Sophie Martin", phone: "+33 6 12 34 56 78" },
    trip: {
      when: "2026-01-20T14:30",
      pickup: "12 rue de Rivoli, 75001 Paris",
      dropoff: "Aéroport Paris-Charles de Gaulle, Terminal 2E",
    },
    payment: { totalTTC: 178.5 },
    ...patch,
  };
}

describe("bon de réservation — numérotation", () => {
  it("produit le format NOVA-<année>-<code>", () => {
    const n = voucherNumber("bk-1", Date.parse("2026-03-04T10:00:00"));
    expect(n).toMatch(/^NOVA-2026-[A-Z2-9]{5}$/);
  });

  it("donne TOUJOURS le même numéro pour la même réservation", () => {
    // Un bon se réimprime : deux numéros pour une même course seraient
    // indéfendables lors d'un contrôle.
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const at = Date.parse("2026-03-04T10:00:00");
    expect(voucherNumber(id, at)).toBe(voucherNumber(id, at));
  });

  it("ne renumérote pas un bon réimprimé l'année suivante", () => {
    // L'année vient de la réservation, pas de l'horloge du serveur.
    const id = "bk-42";
    const booked = Date.parse("2026-12-30T23:00:00");
    expect(voucherNumber(id, booked)).toContain("-2026-");
  });

  it("distingue deux réservations", () => {
    const at = Date.parse("2026-03-04T10:00:00");
    expect(voucherNumber("bk-1", at)).not.toBe(voucherNumber("bk-2", at));
  });

  it("évite les caractères qui se confondent à la lecture", () => {
    // Le numéro est lu à voix haute et recopié à la main : ni O/0 ni I/1.
    for (let i = 0; i < 300; i++) {
      const code = voucherNumber(`bk-${i}`, Date.now()).split("-")[2];
      expect(code, code).not.toMatch(/[OI01]/);
    }
  });
});

describe("bon de réservation — champs obligatoires", () => {
  it("accepte un bon complet", () => {
    expect(missingVoucherFields(voucher())).toEqual([]);
  });

  it("REFUSE les adresses par défaut de buildBooking", () => {
    // Le contrôle le moins évident : ce sont des chaînes non vides, qui
    // passeraient un test de présence et s'imprimeraient telles quelles. Un bon
    // affichant « Adresse de départ → Destination » serait un faux document.
    const v = voucher({
      trip: {
        when: "2026-01-20T14:30",
        pickup: DEFAULT_PICKUP,
        dropoff: DEFAULT_DROPOFF,
      },
    });
    expect(missingVoucherFields(v)).toContain("pickupAddress");
    expect(missingVoucherFields(v)).toContain("dropoffAddress");
  });

  it("signale un SIREN absent ou invalide", () => {
    expect(missingVoucherFields(voucher({ driver: { ...voucher().driver, siret: "" } })))
      .toContain("driverSiret");
    expect(
      missingVoucherFields(voucher({ driver: { ...voucher().driver, siret: "123456789" } }))
    ).toContain("driverSiret");
  });

  it("signale une carte VTC ou une plaque manquante", () => {
    expect(
      missingVoucherFields(voucher({ driver: { ...voucher().driver, vtcCardNumber: "  " } }))
    ).toContain("driverVtcCard");
    expect(
      missingVoucherFields(voucher({ driver: { ...voucher().driver, plate: "" } }))
    ).toContain("vehiclePlate");
  });

  it("signale un client sans téléphone", () => {
    const v = voucher({ client: { name: "Sophie Martin", phone: "" } });
    expect(missingVoucherFields(v)).toEqual(["clientPhone"]);
  });

  it("refuse une heure de prise en charge mal formée", () => {
    const bad = ["", "2026-01-20", "20/01/2026 14:30", "2026-01-20T14:30:00"];
    for (const when of bad) {
      const v = voucher({ trip: { ...voucher().trip, when } });
      expect(missingVoucherFields(v), when).toContain("pickupAt");
    }
  });

  it("refuse un prix nul, négatif ou absurde", () => {
    for (const totalTTC of [0, -10, Number.NaN]) {
      expect(missingVoucherFields(voucher({ payment: { totalTTC } })), String(totalTTC))
        .toContain("price");
    }
  });

  it("nomme chaque manque en français", () => {
    // Le message d'erreur sert à corriger la saisie : une clé technique
    // n'aiderait ni le chauffeur ni le support.
    const v = voucher({
      driver: { firstName: "", lastName: "", siret: "", vtcCardNumber: "", plate: "" },
    });
    const labels = missingVoucherFields(v).map((f) => VOUCHER_FIELD_LABELS[f]);
    expect(labels).toContain("SIREN/SIRET de l'exploitant");
    expect(labels.every((l) => l && !l.includes("_"))).toBe(true);
  });
});

describe("bon de réservation — SIREN/SIRET", () => {
  it("accepte un SIREN et un SIRET valides", () => {
    expect(isValidSiren("552100554")).toBe(true); // SIREN Renault
    expect(isValidSiren("55210055400013")).toBe(true);
    expect(isValidSiren("552 100 554")).toBe(true); // espaces tolérés
  });

  it("rejette une clé de contrôle fausse", () => {
    // La longueur seule ne suffit pas : neuf chiffres au hasard la satisfont.
    expect(isValidSiren("123456789")).toBe(false);
    expect(isValidSiren("552100555")).toBe(false);
  });

  it("rejette une longueur non réglementaire", () => {
    for (const bad of ["", "5521005", "5521005540", "abcdefghi"]) {
      expect(isValidSiren(bad), bad).toBe(false);
    }
  });
});

describe("bon de réservation — mise en forme", () => {
  it("écrit la prise en charge sans passer par un fuseau", () => {
    // L'heure est locale et sans fuseau : un Date intermédiaire la décalerait
    // sur un serveur en UTC, sur le seul document que le chauffeur présentera.
    expect(formatVoucherWhen("2026-01-20T14:30")).toBe("20/01/2026 à 14:30");
    expect(formatVoucherWhen("2026-12-31T23:59")).toBe("31/12/2026 à 23:59");
  });

  it("ne rend rien pour une date illisible", () => {
    expect(formatVoucherWhen("n'importe quoi")).toBe("");
  });

  it("date l'émission avec des nombres à deux chiffres", () => {
    expect(formatIssuedAt(Date.parse("2026-01-05T09:07:00"))).toBe(
      "05/01/2026 à 09:07"
    );
    expect(formatIssuedAt(Number.NaN)).toBe("");
  });

  it("groupe le SIREN et le SIRET pour la recopie", () => {
    expect(formatSiren("552100554")).toBe("552 100 554");
    expect(formatSiren("55210055400013")).toBe("552 100 554 00013");
  });

  it("n'insère pas de double espace quand un nom manque", () => {
    expect(driverFullName({ ...voucher().driver, lastName: "" })).toBe("Jérémy");
  });
});
