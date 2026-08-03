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
  const { error: updateError } = await db
    .from("profiles")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", driverId);

  if (updateError) {
    return NextResponse.json(
      { error: "Échec de la mise à jour du statut chauffeur" },
      { status: 500 }
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
    message: emailed
      ? "Chauffeur validé et e-mail d'activation envoyé"
      : "Chauffeur validé (e-mail non envoyé)",
  });
}
