import { NextRequest } from "next/server";
import { getBookingById } from "@/lib/bookingBroker";
import { bookingActor } from "@/lib/bookings";
import { getServerUser } from "@/lib/session";
import { buildVoucherForBooking } from "@/lib/voucherSource";
import {
  IncompleteVoucherError,
  renderBookingVoucher,
} from "@/lib/pdf/bookingVoucher";
import { isValidRoom, rateLimit } from "@/lib/validation";

// Le rendu PDF s'appuie sur des API Node (Buffer, flux) : pas d'Edge possible.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET → le bon de réservation préalable d'une course, en PDF téléchargeable.
 *
 * ## Qui peut le télécharger
 *
 * Les **deux parties de la course**, personne d'autre. Le document réunit le
 * SIREN et la carte VTC du chauffeur, l'immatriculation de son véhicule, le nom
 * et le téléphone du client, et l'itinéraire : c'est le document le plus dense
 * en données personnelles de toute l'application. L'identité vient de la
 * session via `bookingActor()` — la même définition de « qui est cette personne
 * pour cette réservation » que le chat et les changements de statut.
 *
 * ⚠️ Un tiers et une partie qui n'existe pas reçoivent le **même 404**. Un 403
 * distinct confirmerait l'existence de la réservation à qui devine un
 * identifiant.
 *
 * ## Pourquoi seules les courses payées en produisent un
 *
 * Le bon porte la mention « Payé à l'avance via la plateforme ». L'émettre pour
 * une course `pending` — dont les fonds sont seulement **autorisés**, pas
 * capturés — ou pour une course refusée ou annulée ferait dire au document
 * quelque chose de faux, sur le support même qui sert à prouver la régularité
 * de la course.
 *
 * ## Pourquoi il peut refuser (409)
 *
 * Les mentions obligatoires ne sont pas toutes collectées aujourd'hui (SIREN,
 * adresses réelles). Plutôt qu'imprimer un blanc ou un tiret là où la loi
 * attend une information, la route refuse et **nomme ce qui manque**. Un bon
 * d'apparence conforme mais incomplet est pire qu'un bon absent : il n'est
 * contesté qu'au moment du contrôle.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Générer un PDF coûte du CPU : sans limite, une boucle sur cette route
  // suffit à saturer la VM à un process qui sert tout le site.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const rl = rateLimit(`voucher:${ip}`, 10, 60_000); // 10 / min
  if (!rl.ok) {
    return Response.json(
      { error: "Trop de demandes" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const bookingId = params.id;
  if (!isValidRoom(bookingId)) {
    return Response.json({ error: "Réservation invalide" }, { status: 400 });
  }

  const session = await getServerUser();
  if (session.state !== "ok") {
    // Pas de repli démo ici, contrairement au chat : un bon de réservation
    // n'existe que pour une course réelle, payée, par un compte identifié.
    return Response.json({ error: "Authentification requise" }, { status: 401 });
  }

  const booking = await getBookingById(bookingId);
  // Réservation absente OU appelant étranger : même réponse (voir l'en-tête).
  if (
    !booking ||
    bookingActor(booking, session.user.id, session.user.driverSlug) === "stranger"
  ) {
    return Response.json({ error: "Réservation introuvable" }, { status: 404 });
  }

  if (booking.status !== "paid" && booking.status !== "completed") {
    return Response.json(
      {
        error: "Bon disponible une fois la course payée",
        status: booking.status,
      },
      { status: 409 }
    );
  }

  const { voucher, degraded } = await buildVoucherForBooking(booking);

  let pdf: Buffer;
  try {
    pdf = await renderBookingVoucher(voucher);
  } catch (err) {
    if (err instanceof IncompleteVoucherError) {
      console.error(
        `[bon] ${voucher.number} non émis — manquant : ${err.fields.join(", ")}`
      );
      return Response.json(
        {
          error: "Le bon de réservation ne peut pas être émis : données manquantes.",
          missing: err.fields,
          // Sans clé de service, rien n'est lisible : le dire évite de faire
          // chercher une saisie oubliée là où c'est la configuration qui manque.
          reason: degraded ? "database-unavailable" : "incomplete-data",
        },
        { status: 409 }
      );
    }
    console.error(
      `[bon] rendu impossible pour ${voucher.number} : ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return Response.json({ error: "Génération impossible" }, { status: 500 });
  }

  const filename = `bon-reservation-${voucher.number}.pdf`;
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.byteLength),
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Données personnelles des deux parties : ni cache partagé, ni disque.
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
