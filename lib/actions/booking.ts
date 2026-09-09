"use server";

import { getServerUser } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { isStripeConfigured } from "@/lib/config";
import { createBooking as createBookingRecord } from "@/lib/bookingBroker";
import { isPersistenceEnabled } from "@/lib/persistence";
import { getDriver } from "@/lib/drivers";
import { clampRate } from "@/lib/pricing";
import { computeAmount, type BookingUnit } from "@/lib/payments";
import {
  driverServesTransferDestination,
  isKnownTransferDestination,
  transferFareForDriver,
} from "@/lib/transfer";
import {
  DEFAULT_SCHEDULE,
  isWithinSchedule,
  sanitizeSchedule,
} from "@/lib/schedule";
import { isFutureBooking } from "@/lib/bookings";
import { sanitizeText } from "@/lib/validation";
import type { BookingPriceRow, VehicleCategory } from "@/types/database.types";

/**
 * Création d'une course, en Server Action.
 *
 * ## Ce que cette action fait, et ce qu'elle ne fait pas
 *
 * Elle ne parle pas à `public.bookings` directement : elle passe par
 * `bookingBroker.createBooking`, qui persiste ET diffuse sur le flux SSE du
 * chauffeur. Une insertion en direct serait durable mais invisible — le
 * chauffeur ne verrait la demande qu'au rechargement suivant, et deux chemins
 * d'écriture finiraient par diverger sur les règles.
 *
 * ## Qui fait autorité sur le montant
 *
 * Le montant **facturé** vient de `computeAmount` + `clampRate` (TypeScript,
 * testé unitairement) : c'est le même calcul que `/api/checkout`, et une seule
 * autorité sur le prix est la seule façon de ne pas facturer deux montants
 * différents pour la même course. `calculate_booking_price` est appelée pour
 * la répartition commission / net chauffeur, et sert de **contre-mesure** : un
 * écart entre les deux est journalisé bruyamment plutôt que d'être absorbé en
 * silence. Le tarif du chauffeur est reclampé dans la bande de sa gamme avant
 * tout calcul — un tarif stocké avant un changement de barème ne doit jamais
 * facturer hors bande.
 *
 * ## Le paiement
 *
 * `capture_method: "manual"` : les fonds sont **autorisés** à la demande, puis
 * capturés quand le chauffeur accepte. Un refus relâche l'autorisation sans
 * qu'un centime n'ait bougé — c'est ce qui rend acceptable de demander la
 * carte avant d'avoir une réponse.
 *
 * ⚠️ Le `client_secret` n'est jamais stocké : il autorise à lui seul la
 * confirmation du paiement depuis le navigateur. Il ne fait que transiter dans
 * la valeur de retour.
 *
 * ## Dégradation gracieuse
 *
 * Sans clés Stripe ou sans service role, l'action réussit quand même et
 * renvoie `mode: "demo"` avec `clientSecret: null` : la démonstration sans
 * configuration continue de fonctionner, comme partout ailleurs dans ce dépôt.
 */

export interface CreateBookingInput {
  /** Slug du chauffeur dans `lib/drivers.ts`. */
  driverId: string;
  unit: BookingUnit;
  /** Heures ou jours ; ignorée pour un transfert (un trajet). */
  quantity?: number;
  /** Identifiant de route, requis lorsque `unit === "transfer"`. */
  transfer?: string;
  /** Heure de prise en charge, locale et sans fuseau : `YYYY-MM-DDTHH:mm`. */
  when: string;
  pickup?: string;
  dropoff?: string;
}

export type CreateBookingErrorCode =
  | "unauthenticated"
  | "unknown-driver"
  | "unsupported-destination"
  | "invalid-schedule"
  | "invalid-amount"
  | "payment-failed"
  | "unexpected";

export type CreateBookingResult =
  | {
      ok: true;
      bookingId: string;
      amountCents: number;
      commissionCents: number;
      /** `null` en mode démo : aucun paiement réel à confirmer. */
      clientSecret: string | null;
      mode: "stripe" | "demo";
    }
  | { ok: false; code: CreateBookingErrorCode; error: string };

const MESSAGES: Record<CreateBookingErrorCode, string> = {
  unauthenticated: "Connectez-vous pour réserver cette course.",
  "unknown-driver": "Ce chauffeur n'existe pas.",
  "unsupported-destination": "Ce chauffeur ne dessert pas cette destination.",
  "invalid-schedule": "Ce créneau n'est pas disponible.",
  "invalid-amount": "Le montant de cette course n'a pas pu être calculé.",
  "payment-failed": "Le paiement n'a pas pu être initialisé.",
  unexpected: "Une erreur est survenue. Réessayez dans un instant.",
};

function fail(code: CreateBookingErrorCode): CreateBookingResult {
  return { ok: false, code, error: MESSAGES[code] };
}

export async function createBooking(
  input: CreateBookingInput
): Promise<CreateBookingResult> {
  try {
    /* a) Identité — depuis le cookie de session, jamais depuis l'appelant. */
    const session = await getServerUser();
    if (session.state !== "ok") {
      // En mode démo le serveur ne voit aucune session : cette action, qui
      // écrit en base et déclenche un paiement, exige une identité réelle.
      return fail("unauthenticated");
    }
    const user = session.user;

    const driverId = sanitizeText(input.driverId, 64);
    const driver = getDriver(driverId);
    if (!driver) return fail("unknown-driver");

    const unit: BookingUnit =
      input.unit === "day" || input.unit === "transfer" ? input.unit : "hour";

    /* Une route de transfert doit être connue ET desservie par ce chauffeur. */
    let transfer: string | undefined;
    if (unit === "transfer") {
      transfer = sanitizeText(input.transfer, 32);
      // `driverServesTransferDestination` est permissive sur un id inconnu
      // (cela veut dire « aucun filtre ») : l'id se vérifie donc d'abord.
      if (
        !isKnownTransferDestination(transfer) ||
        !driverServesTransferDestination(driver, transfer)
      ) {
        return fail("unsupported-destination");
      }
    }

    /* Créneau : dans le futur, et dans le planning déclaré du chauffeur. */
    const when = sanitizeText(input.when, 60);
    const [date = "", time = ""] = when.split("T");
    // Le planning vient de la fiche seule : `scheduleOf` lit les surcharges
    // dans le localStorage, qui n'existe pas ici — l'importer ferait entrer un
    // module de navigateur dans une action serveur.
    const schedule = driver.schedule
      ? sanitizeSchedule(driver.schedule)
      : DEFAULT_SCHEDULE;
    if (!isFutureBooking(date, time) || !isWithinSchedule(schedule, date, time)) {
      return fail("invalid-schedule");
    }

    /* b) Prix. Autorité TypeScript, contre-mesure SQL. */
    const category = driver.categories[0] as VehicleCategory | undefined;
    let amount;
    try {
      amount = computeAmount(
        clampRate(category, "hour", driver.pricePerHour),
        clampRate(category, "day", driver.pricePerDay),
        unit,
        Number(input.quantity ?? 1),
        transferFareForDriver(driver)
      );
    } catch {
      return fail("invalid-amount");
    }

    const priced = await priceInDatabase({
      category,
      unit,
      quantity: amount.hours,
      pricePerHour: driver.pricePerHour,
      pricePerDay: driver.pricePerDay,
      transferFare: transferFareForDriver(driver),
    });

    if (priced && priced.amount_cents !== amount.amountCents) {
      // Ni exception ni correction : le calcul testé reste la référence, mais
      // un écart signifie que l'un des deux barèmes a bougé sans l'autre.
      console.error(
        `[booking] écart de tarification pour ${driverId} : ` +
          `TypeScript ${amount.amountCents} c ≠ SQL ${priced.amount_cents} c`
      );
    }

    const commissionCents = priced
      ? Math.round(Number(priced.commission) * 100)
      : Math.round(amount.amountCents * 0.25);

    /* c) La course, via le broker : persistée ET diffusée au chauffeur. */
    const booking = await createBookingRecord({
      driverId,
      clientId: user.id,
      clientName: `${user.firstName} ${user.lastName}`.trim() || "Client",
      clientEmail: user.email ?? "",
      hours: amount.hours,
      unit,
      transfer,
      total: amount.total,
      pickup: sanitizeText(input.pickup, 120),
      dropoff: sanitizeText(input.dropoff, 120),
      when,
    });

    /* d) L'autorisation Stripe. */
    const stripe = getStripe();
    if (!stripe || !isStripeConfigured) {
      // Pas de clé : la course existe, le paiement est simulé côté interface.
      return {
        ok: true,
        bookingId: booking.id,
        amountCents: amount.amountCents,
        commissionCents,
        clientSecret: null,
        mode: "demo",
      };
    }

    try {
      const intent = await stripe.paymentIntents.create(
        {
          amount: amount.amountCents,
          currency: "eur",
          // Fonds bloqués maintenant, encaissés à l'acceptation du chauffeur.
          capture_method: "manual",
          automatic_payment_methods: { enabled: true },
          metadata: {
            booking_id: booking.id,
            driver_slug: driverId,
            client_id: user.id,
            unit,
            ...(transfer ? { transfer } : {}),
          },
        },
        // Une double soumission ne doit pas créer deux autorisations sur la
        // carte du client : la course fournit sa propre clé d'idempotence.
        { idempotencyKey: `booking:${booking.id}` }
      );

      await recordPayment({
        bookingId: booking.id,
        intentId: intent.id,
        amountCents: amount.amountCents,
        commissionCents,
        status: intent.status,
      });

      return {
        ok: true,
        bookingId: booking.id,
        amountCents: amount.amountCents,
        commissionCents,
        // e) Le secret ne transite que par ici, jamais vers la base.
        clientSecret: intent.client_secret,
        mode: "stripe",
      };
    } catch (err) {
      // La course reste `pending` : le client peut relancer le paiement sans
      // avoir à redemander la course. On garde la trace de l'échec.
      await recordPayment({
        bookingId: booking.id,
        intentId: null,
        amountCents: amount.amountCents,
        commissionCents,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
      console.error(
        `[booking] création du PaymentIntent refusée pour ${booking.id} : ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      return fail("payment-failed");
    }
  } catch (err) {
    console.error(
      `[booking] échec inattendu : ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return fail("unexpected");
  }
}

/* -------------------------------------------------------------------------- */

/**
 * Appelle `calculate_booking_price`. Renvoie `null` si la base n'est pas
 * configurée ou refuse : le calcul TypeScript fait autorité, cet appel ne doit
 * jamais empêcher une réservation d'aboutir.
 */
async function priceInDatabase(args: {
  category: VehicleCategory | undefined;
  unit: BookingUnit;
  quantity: number;
  pricePerHour: number;
  pricePerDay: number;
  transferFare: number;
}): Promise<BookingPriceRow | null> {
  const db = getSupabaseAdmin();
  if (!db || !args.category) return null;

  const { data, error } = await db.rpc("calculate_booking_price", {
    p_category: args.category,
    p_unit: args.unit,
    p_quantity: args.quantity,
    p_price_per_hour: args.pricePerHour,
    p_price_per_day: args.pricePerDay,
    p_transfer_fare: args.transferFare,
  });

  if (error) {
    console.error(`[booking] calculate_booking_price : ${error.message}`);
    return null;
  }
  // `returns table` : PostgREST rend un tableau, même pour une seule ligne.
  const rows = data as unknown as BookingPriceRow[] | null;
  return rows?.[0] ?? null;
}

/** Trace le paiement. Un échec d'écriture ne fait pas échouer la réservation. */
async function recordPayment(args: {
  bookingId: string;
  intentId: string | null;
  amountCents: number;
  commissionCents: number;
  status: string;
  error?: string;
}): Promise<void> {
  if (!isPersistenceEnabled) return;
  const db = getSupabaseAdmin();
  if (!db) return;

  const { error } = await db.from("payments").insert({
    booking_id: args.bookingId,
    stripe_payment_intent_id: args.intentId,
    amount_cents: args.amountCents,
    commission_cents: args.commissionCents,
    capture_method: "manual",
    status: mapIntentStatus(args.status),
    authorized_at: args.status === "requires_capture" ? new Date().toISOString() : null,
    last_error: args.error ?? null,
  });

  if (error) {
    console.error(
      `[booking] paiement non journalisé pour ${args.bookingId} : ${error.message}`
    );
  }
}

/**
 * Statut Stripe → `payment_status`. Les intitulés coïncident presque, mais
 * Stripe en ajoute que l'enum ne connaît pas : tout inconnu retombe sur
 * l'état initial plutôt que d'échouer à l'insertion.
 */
function mapIntentStatus(
  status: string
):
  | "requires_payment_method"
  | "requires_capture"
  | "processing"
  | "succeeded"
  | "canceled"
  | "failed" {
  switch (status) {
    case "requires_capture":
    case "processing":
    case "succeeded":
    case "canceled":
    case "failed":
    case "requires_payment_method":
      return status;
    // requires_confirmation / requires_action : le client n'a pas fini.
    default:
      return "requires_payment_method";
  }
}
