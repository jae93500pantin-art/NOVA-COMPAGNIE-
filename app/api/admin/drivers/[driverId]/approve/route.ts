import { NextResponse } from "next/server";
import { requireAdmin, adminDb } from "@/lib/admin";
import { sendEmail, driverApprovedEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Maps the guard's refusal states onto HTTP responses. */
const GUARD_ERRORS: Record<string, { status: number; error: string }> = {
  unconfigured: { status: 503, error: "Back-office indisponible : Supabase n'est pas configuré" },
  "no-service-role": {
    status: 503,
    error: "Back-office indisponible : SUPABASE_SERVICE_ROLE_KEY manquante",
  },
  anonymous: { status: 401, error: "Non autorisé : session manquante" },
  forbidden: { status: 403, error: "Accès refusé : privilèges administrateur requis" },
};

export async function POST(
  request: Request,
  { params }: { params: { driverId: string } }
) {
  const guard = await requireAdmin();
  if (guard.state !== "ok") {
    const { status, error } = GUARD_ERRORS[guard.state];
    return NextResponse.json({ error }, { status });
  }

  const db = adminDb();
  if (!db) {
    return NextResponse.json({ error: "Client privilégié indisponible" }, { status: 503 });
  }

  const { driverId } = params;

  // 1. The target must exist AND actually be a driver — approving a client row
  //    would be meaningless and is refused explicitly.
  const { data: driver, error: fetchError } = await db
    .from("profiles")
    .select("id, email, first_name, last_name, role, status")
    .eq("id", driverId)
    .single();

  if (fetchError || !driver) {
    return NextResponse.json({ error: "Chauffeur introuvable" }, { status: 404 });
  }
  if (driver.role !== "driver") {
    return NextResponse.json({ error: "Ce profil n'est pas un chauffeur" }, { status: 400 });
  }
  if (driver.status === "approved") {
    return NextResponse.json({ success: true, message: "Chauffeur déjà validé" });
  }

  // 2. Status update (service role — RLS scopes profile writes to their owner).
  /**
   * Validation = trois écritures indissociables : la ligne d'annuaire, son
   * slug, et le `driver_slug` du profil. `approve_driver()` les fait dans UNE
   * transaction côté base.
   *
   * Les séparer ici serait un piège : un slug posé sur `drivers` sans son
   * pendant sur `profiles` donnerait un chauffeur visible publiquement mais
   * incapable d'accepter la moindre course — `bookingActor()` ne le
   * reconnaîtrait pas. Une panne qu'on ne découvre qu'à la première
   * réservation.
   */
  const { data: slug, error: approveError } = await db.rpc("approve_driver", {
    p_profile: driverId,
  });

  if (approveError) {
    return NextResponse.json(
      { error: `Échec de la validation : ${approveError.message}` },
      { status: 500 }
    );
  }

  const { error: updateError } = await db
    .from("profiles")
    .update({ approved_at: new Date().toISOString() })
    .eq("id", driverId);

  if (updateError) {
    // Le chauffeur EST validé (la transaction a réussi) ; seule l'horodatage
    // a échoué. On le journalise sans transformer un succès en erreur.
    console.error(
      `[admin] approved_at non enregistré pour ${driverId} : ${updateError.message}`
    );
  }

  // 3. Activation email — best effort. The approval already succeeded, so a
  //    failed send must not turn into a failed request.
  const origin = new URL(request.url).origin;
  const { subject, html } = driverApprovedEmail({
    firstName: driver.first_name || "Chauffeur",
    loginUrl: `${origin}/auth/login`,
  });
  const emailed = driver.email ? await sendEmail({ to: driver.email, subject, html }) : false;

  return NextResponse.json({
    success: true,
    emailed,
    // Le slug est l'URL publique du chauffeur : le renvoyer permet à la console
    // d'y renvoyer directement, et de vérifier qu'il a bien été attribué.
    slug,
    message: emailed
      ? "Chauffeur validé et e-mail d'activation envoyé"
      : "Chauffeur validé (e-mail non envoyé)",
  });
}
