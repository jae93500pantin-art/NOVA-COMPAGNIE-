// @vitest-environment node
import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import {
  IncompleteVoucherError,
  renderBookingVoucher,
} from "@/lib/pdf/bookingVoucher";
import { DEFAULT_PICKUP, DEFAULT_DROPOFF } from "@/lib/bookings";
import type { BookingVoucher } from "@/lib/bookingVoucher";

/**
 * Le rendu PDF lui-même. Ces tests ne vérifient pas la mise en page — ils
 * vérifient qu'un document sort, et surtout qu'aucun document ne sort quand il
 * serait incomplet.
 */

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

/**
 * Relit le texte RÉELLEMENT imprimé dans le PDF.
 *
 * Indispensable : `@react-pdf` supprime en silence les glyphes absents de la
 * police standard (`€`, `—`). Le rendu réussit, le fichier est valide, et le
 * caractère a disparu. Seule une relecture du flux de contenu le détecte.
 */
function printedText(pdf: Buffer): string {
  const head = pdf.toString("latin1");
  const m = /\/Length (\d+)[\s\S]{0,80}?stream\r?\n/.exec(head);
  if (!m) return "";
  const start = m.index + m[0].length;
  const content = inflateSync(
    pdf.subarray(start, start + Number(m[1]))
  ).toString("latin1");

  // Un bloc BT..ET par ligne ; les <hex> sont les codes de caractères.
  return content
    .split("BT")
    .slice(1)
    .map((block) => {
      const body = block.split("ET")[0];
      let line = "";
      const hex = /<([0-9A-Fa-f]+)>/g;
      let x;
      while ((x = hex.exec(body))) {
        line += Buffer.from(x[1], "hex").toString("latin1");
      }
      return line;
    })
    .join("\n");
}

/**
 * Le texte imprimé, mis à plat.
 *
 * ⚠️ `@react-pdf` découpe une même ligne en plusieurs blocs `BT..ET` (un par
 * segment de mise en page) : « 178,50 EUR » sort en trois morceaux. Comparer
 * sans aplatir ferait échouer des assertions parfaitement justes — et,
 * pire, inviterait à les affaiblir.
 */
function flat(pdf: Buffer): string {
  return printedText(pdf).replace(/\s+/g, " ").trim();
}

describe("bon de réservation — rendu PDF", () => {
  it("produit un vrai fichier PDF", async () => {
    const pdf = await renderBookingVoucher(voucher());
    // %PDF- : la signature du format. Sans elle, le navigateur télécharge un
    // fichier que rien n'ouvrira.
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(1000);
  }, 30_000);

  it("imprime le montant AVEC sa devise", async () => {
    // Le piège qui a coûté une livraison : « € » est absent de la police
    // standard et disparaît sans la moindre erreur. Un prix sans devise sur un
    // document légal ne veut rien dire — et rien ne l'aurait signalé.
    const text = flat(await renderBookingVoucher(voucher()));
    expect(text).toContain("178,50 EUR");
  }, 30_000);

  it("n'imprime que des caractères que la police sait rendre", async () => {
    const text = flat(await renderBookingVoucher(voucher()));
    // Les accents français doivent survivre…
    expect(text).toContain("BON DE RÉSERVATION PRÉALABLE");
    expect(text).toContain("Aéroport");
    // …et aucun glyphe ne doit avoir été avalé au passage.
    expect(text).not.toMatch(/[^\x00-\xFF]/);
  }, 30_000);

  it("reprend les mentions légales et le numéro de bon", async () => {
    const text = flat(await renderBookingVoucher(voucher()));
    expect(text).toContain("NOVA-2026-A3F9K");
    expect(text).toContain("VTC-075-2024-000123");
    expect(text).toContain("552 100 554");
    expect(text).toContain("Payé à l'avance via la plateforme NOVA Compagnie");
    expect(text).toContain("agents de contrôle");
  }, 30_000);

  it("REFUSE d'émettre un bon incomplet", async () => {
    // La dernière porte avant qu'un document incomplet n'existe en fichier :
    // un appelant qui oublierait de vérifier ne doit pas pouvoir en produire un.
    const incomplete = voucher({
      trip: {
        when: "2026-01-20T14:30",
        pickup: DEFAULT_PICKUP,
        dropoff: DEFAULT_DROPOFF,
      },
    });
    await expect(renderBookingVoucher(incomplete)).rejects.toThrow(
      IncompleteVoucherError
    );
  }, 30_000);

  it("nomme les mentions manquantes, en français", async () => {
    const naked = voucher({
      driver: { firstName: "", lastName: "", siret: "", vtcCardNumber: "", plate: "" },
    });
    await expect(renderBookingVoucher(naked)).rejects.toMatchObject({
      fields: expect.arrayContaining(["SIREN/SIRET de l'exploitant"]),
    });
  }, 30_000);
});
