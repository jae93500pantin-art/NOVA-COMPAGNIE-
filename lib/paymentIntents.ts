import "server-only";

import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isPersistenceEnabled } from "@/lib/persistence";
import type { PaymentStatus } from "@/types/database.types";

/**
 * Capture et libération des fonds autorisés.
 *
 * La carte du client est **autorisée** au moment de la demande
 * (`capture_method: "manual"`, voir `lib/actions/booking.ts`) : l'argent est
 * bloqué mais n'a pas bougé. Deux issues seulement :
 *
 *  - le chauffeur accepte  → `capture()`  : les fonds partent ;
 *  - le chauffeur refuse, ou le client renonce → `cancel()` : l'autorisation
 *    est relâchée et la banque libère le montant, sans qu'un centime n'ait
 *    circulé ni qu'aucun remboursement n'apparaisse sur le relevé.
 *
 * ⚠️ **Ne jamais laisser une autorisation orpheline.** Une course refusée dont
 * on oublie d'annuler l'intention laisse le client avec des fonds bloqués
 * pendant des jours, sans transaction à contester — c'est le pire des deux
 * mondes. C'est pourquoi la libération est appelée sur *chaque* issue
 * terminale, y compris l'auto-clôture.
 *
 * ## Ce que ces fonctions ne font pas
 *
 * Elles ne font jamais échouer la requête appelante. Un refus de course reste
 * un refus même si Stripe ne répond pas : l'échec est journalisé et inscrit
 * dans `payments.last_error`, à rattraper. Bloquer le refus d'un chauffeur
 * parce que Stripe a hoqueté serait pire que l'inverse.
 */

interface PaymentRow {
  id: string;
  stripe_payment_intent_id: string | null;
  status: PaymentStatus;
}

function db() {
  return isPersistenceEnabled ? getSupabaseAdmin() : null;
}

/** L'intention de paiement d'une course, si elle en a une. */
async function paymentFor(bookingId: string): Promise<PaymentRow | null> {
  const client = db();
  if (!client) return null;
  const { data, error } = await client
    .from("payments")
    .select("id, stripe_payment_intent_id, status")
    .eq("booking_id", bookingId)
    // Une course ne devrait avoir qu'une intention ; en cas de reprise après
    // échec, la plus récente est celle qui vaut.
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as PaymentRow;
}

async function record(
  paymentId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const client = db();
  if (!client) return;
  const { error } = await client
    .from("payments")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", paymentId);
  if (error) {
    console.error(`[paiement] trace non enregistrée (${paymentId}) : ${error.message}`);
  }
}

/**
 * Encaisse les fonds autorisés. Appelée quand le chauffeur accepte.
 *
 * Renvoie `true` si la course peut être considérée comme payée — y compris
 * quand il n'y a **rien à capturer** (mode démo, paiement en espèces, absence
 * de Stripe) : l'acceptation ne doit pas être bloquée par un dispositif de
 * paiement absent.
 */
export async function captureBookingPayment(bookingId: string): Promise<boolean> {
  const payment = await paymentFor(bookingId);
  if (!payment?.stripe_payment_intent_id) return true;

  // Déjà capturée : rejouer la capture renverrait une erreur Stripe pour un
  // état pourtant correct.
  if (payment.status === "succeeded") return true;

  const stripe = getStripe();
  if (!stripe) return true;

  try {
    const intent = await stripe.paymentIntents.capture(
      payment.stripe_payment_intent_id
    );
    await record(payment.id, {
      status: intent.status === "succeeded" ? "succeeded" : "processing",
      captured_at: new Date().toISOString(),
      last_error: null,
    });
    return intent.status === "succeeded";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[paiement] capture refusée pour ${bookingId} : ${message}`);
    await record(payment.id, { status: "failed", last_error: message });
    return false;
  }
}

/**
 * Relâche l'autorisation. Appelée sur un refus, une annulation, ou la
 * clôture automatique d'une course jamais honorée.
 *
 * Silencieuse quand il n'y a rien à relâcher, et sur une intention déjà
 * capturée : à ce stade ce n'est plus une autorisation mais un paiement, et
 * l'annuler demanderait un remboursement — une décision qui n'appartient pas
 * à cette fonction.
 */
export async function releaseBookingPayment(bookingId: string): Promise<void> {
  const payment = await paymentFor(bookingId);
  if (!payment?.stripe_payment_intent_id) return;
  if (payment.status === "succeeded" || payment.status === "canceled") return;

  const stripe = getStripe();
  if (!stripe) return;

  try {
    await stripe.paymentIntents.cancel(payment.stripe_payment_intent_id);
    await record(payment.id, {
      status: "canceled",
      last_error: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Journalisé haut et fort : des fonds restés bloqués chez un client sont
    // invisibles depuis l'application, seul ce message les signale.
    console.error(
      `[paiement] ⚠️ autorisation NON relâchée pour ${bookingId} : ${message}`
    );
    await record(payment.id, { last_error: message });
  }
}
