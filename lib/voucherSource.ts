import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/config";
import type { Booking } from "@/lib/bookings";
import { voucherNumber, type BookingVoucher } from "@/lib/bookingVoucher";

/**
 * Rassemble les données d'un bon de réservation.
 *
 * ## Pourquoi un module à part, et avec le service role
 *
 * Le bon exige des données que **rien d'autre n'expose** : le SIREN et le
 * numéro de carte VTC du chauffeur (`drivers`), l'immatriculation du véhicule
 * (`vehicles`, dont la RLS réserve la lecture au propriétaire, précisément
 * parce que la plaque est une donnée personnelle indirecte), et le téléphone du
 * client (`profiles`, restreint à son propriétaire depuis le durcissement de
 * `profiles_select`).
 *
 * Aucune session utilisateur ne peut lire tout cela : le client n'a pas accès
 * au SIREN du chauffeur, le chauffeur n'a pas accès à la fiche du client. Seul
 * le serveur, qui a déjà vérifié que l'appelant est **partie à cette course**,
 * est en position de réunir les deux moitiés.
 *
 * ⚠️ C'est donc un module dont l'appelant DOIT avoir autorisé l'accès avant de
 * l'appeler. Il n'effectue lui-même aucun contrôle d'identité — l'exposer par
 * une route sans `bookingActor()` publierait les coordonnées des deux parties à
 * qui connaît un identifiant de réservation.
 *
 * ## Dégradation gracieuse
 *
 * Sans clé de service, les champs restent vides plutôt que la fonction
 * n'échoue : `missingVoucherFields` les signalera un à un, ce qui est un bien
 * meilleur diagnostic qu'une exception de connexion. Le mode démo ne peut de
 * toute façon pas produire de bon — il n'a ni SIREN ni carte VTC.
 */

interface DriverLegalRow {
  id: string;
  siret: string | null;
  vtc_card_number: string | null;
}

interface ProfileNameRow {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
}

export interface VoucherSourceResult {
  voucher: BookingVoucher;
  /** Vrai quand la base n'est pas jointe : diagnostic, pas donnée métier. */
  degraded: boolean;
}

/** Assemble le bon d'une réservation, champs manquants compris. */
export async function buildVoucherForBooking(
  booking: Booking
): Promise<VoucherSourceResult> {
  const empty = {
    firstName: "",
    lastName: "",
    siret: "",
    vtcCardNumber: "",
    plate: "",
  };

  const db = isSupabaseAdminConfigured ? getSupabaseAdmin() : null;
  let driver = empty;
  // Le nom porté par la réservation est celui saisi au moment de la commande ;
  // il sert de repli si la fiche du client a depuis été effacée (RGPD).
  let client = { name: booking.clientName, phone: "" };

  if (db) {
    const [legal, clientProfile] = await Promise.all([
      readDriverLegal(db, booking.driverId),
      readClientContact(db, booking.clientId),
    ]);
    driver = legal;
    client = {
      name: clientProfile.name || booking.clientName,
      phone: clientProfile.phone,
    };
  }

  return {
    degraded: !db,
    voucher: {
      // Numéroté sur la date de RÉSERVATION, pas sur l'horloge : un bon
      // réimprimé l'année suivante doit garder son numéro.
      number: voucherNumber(booking.id, booking.createdAt),
      issuedAt: Date.now(),
      driver,
      client,
      trip: {
        when: booking.when,
        pickup: booking.pickup,
        dropoff: booking.dropoff,
      },
      payment: { totalTTC: booking.total },
    },
  };
}

/* -------------------------------------------------------------------------- */

type Db = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/**
 * Identité légale du chauffeur, à partir de son slug d'annuaire.
 *
 * Trois tables, parce que les trois informations ne vivent pas ensemble :
 * l'habilitation dans `drivers`, le nom dans `profiles`, la plaque dans
 * `vehicles`.
 */
async function readDriverLegal(db: Db, driverSlug: string) {
  const { data: row, error } = await db
    .from("drivers")
    .select("id, siret, vtc_card_number")
    .eq("slug", driverSlug)
    .maybeSingle();

  if (error || !row) {
    if (error) {
      console.error(`[bon] chauffeur ${driverSlug} illisible : ${error.message}`);
    }
    return { firstName: "", lastName: "", siret: "", vtcCardNumber: "", plate: "" };
  }
  const legal = row as unknown as DriverLegalRow;

  const [{ data: profile }, { data: vehicle }] = await Promise.all([
    db
      .from("profiles")
      .select("first_name, last_name, phone")
      .eq("id", legal.id)
      .maybeSingle(),
    // Le véhicule mis en avant : un index unique garantit qu'il n'y en a qu'un
    // par chauffeur, la plaque affichée ne peut donc pas être ambiguë.
    db
      .from("vehicles")
      .select("plate")
      .eq("driver_slug", driverSlug)
      .eq("is_primary", true)
      .maybeSingle(),
  ]);

  const p = (profile ?? null) as ProfileNameRow | null;
  const plate = ((vehicle ?? null) as { plate: string | null } | null)?.plate;

  return {
    firstName: p?.first_name ?? "",
    lastName: p?.last_name ?? "",
    siret: legal.siret ?? "",
    vtcCardNumber: legal.vtc_card_number ?? "",
    plate: plate ?? "",
  };
}

/** Nom et téléphone du client, depuis son profil. */
async function readClientContact(db: Db, clientId: string) {
  const { data, error } = await db
    .from("profiles")
    .select("first_name, last_name, phone")
    .eq("id", clientId)
    .maybeSingle();

  if (error || !data) return { name: "", phone: "" };
  const p = data as unknown as ProfileNameRow;
  return {
    name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
    phone: p.phone ?? "",
  };
}
