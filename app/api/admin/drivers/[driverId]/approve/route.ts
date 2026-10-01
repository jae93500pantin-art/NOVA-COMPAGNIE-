import { NextResponse } from "next/server";
import { requireAdmin, adminDb } from "@/lib/admin";
import { adminRefusal } from "@/lib/adminHttp";
import { sendEmail, driverApprovedEmail } from "@/lib/email";
import { logAdminAction } from "@/lib/adminDocuments";
import {
  blockingDocuments,
  overrideError,
  DOCUMENT_LABELS,
  type ReviewedDocument,
} from "@/lib/driverDocuments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Maps the guard's refusal states onto HTTP responses. */
export async function POST(
  request: Request,
  { params }: { params: { driverId: string } }
) {
  const guard = await requireAdmin();
  if (guard.state !== "ok") {
    const { status, error } = adminRefusal(guard.state);
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

  /**
   * ⚠️ LE CONTRÔLE DES PIÈCES CONDITIONNE LA VALIDATION.
   *
   * C'est le cœur de cette route. La page publique affiche « habilitations
   * vérifiées » : si ce bouton pouvait valider un dossier que personne n'a
   * regardé, la mention serait une publicité trompeuse, et un incident avec un
   * faux chauffeur engagerait la plateforme.
   *
   * Trois motifs de blocage, et l'écran doit pouvoir dire lequel : pièce
   * absente, pièce déposée mais non contrôlée, pièce périmée. Le contrôle est
   * refait ICI et pas seulement dans l'interface — un bouton grisé n'est pas
   * une règle, c'est une politesse.
   */
  const { data: docRows } = await db
    .from("driver_documents")
    .select("kind, checked_ok, expires_at")
    .eq("driver_id", driverId);

  const docs: ReviewedDocument[] = (
    (docRows ?? []) as { kind: string; checked_ok: boolean | null; expires_at: string | null }[]
  ).map((d) => ({
    kind: d.kind,
    checkedOk: d.checked_ok === true,
    expiresAt: d.expires_at,
  }));

  /**
   * ⚠️ DÉROGATION : l'administrateur peut valider un dossier incomplet.
   *
   * Demandé explicitement par le propriétaire le 2026-10-02. Deux garde-fous
   * **non négociables** l'accompagnent, et les retirer viderait la dérogation
   * de son sens :
   *
   * 1. **Une justification écrite est exigée** (20 caractères minimum). C'est
   *    la seule pièce qui expliquera, six mois plus tard, pourquoi un dossier
   *    incomplet a été accepté.
   * 2. **La trace dit que c'est une dérogation**, avec la liste de ce qui
   *    manquait. Journaliser une dérogation comme une validation ordinaire
   *    reviendrait à l'effacer.
   *
   * ⚠️ Et surtout : ce chauffeur sera référencé mais **PAS marqué « pièces
   * vérifiées »** sur sa fiche publique. Référencé et vérifié ne sont plus la
   * même chose — c'est `allRequiredChecked` qui décide de la mention, pas le
   * statut du compte.
   */
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // Pas de corps = validation ordinaire. Le chemin normal reste le plus
    // simple à appeler ; la dérogation demande un effort explicite.
  }
  const wantsOverride = body.override === true;
  const justification =
    typeof body.justification === "string" ? body.justification.trim() : "";

  const blocking = blockingDocuments(docs);

  if (blocking.length > 0 && wantsOverride) {
    const invalid = overrideError(justification);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }
  }

  if (blocking.length > 0 && !wantsOverride) {
    const REASONS: Record<string, string> = {
      missing: "absente",
      unchecked: "non contrôlée",
      expired: "expirée",
    };
    return NextResponse.json(
      {
        error: "Dossier incomplet : validation refusée",
        blocking: blocking.map((b) => ({
          kind: b.kind,
          label: DOCUMENT_LABELS[b.kind].label,
          reason: b.reason,
          text: `${DOCUMENT_LABELS[b.kind].label} — ${REASONS[b.reason]}`,
        })),
      },
      { status: 409 }
    );
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

  // Trace de la décision : qui, quand, et sur quelles pièces. C'est la preuve
  // en cas de litige — elle s'écrit APRÈS le succès, jamais avant.
  const overridden = blocking.length > 0;
  await logAdminAction(
    guard.userId,
    // ⚠️ Action distincte : chercher « driver_approved » dans le journal ne doit
    // pas remonter les dérogations, sinon elles se perdent dans la masse.
    overridden ? "driver_approved_override" : "driver_approved",
    {
      driver_id: driverId,
      slug,
      documents: docs.map((d) => ({ kind: d.kind, expires_at: d.expiresAt })),
      emailed,
      ...(overridden
        ? {
            justification,
            bypassed: blocking.map((b) => ({ kind: b.kind, reason: b.reason })),
          }
        : {}),
    }
  );

  return NextResponse.json({
    success: true,
    overridden,
    emailed,
    // Le slug est l'URL publique du chauffeur : le renvoyer permet à la console
    // d'y renvoyer directement, et de vérifier qu'il a bien été attribué.
    slug,
    message:
      (overridden ? "Chauffeur validé PAR DÉROGATION" : "Chauffeur validé") +
      (emailed ? " et e-mail d'activation envoyé" : " (e-mail non envoyé)") +
      // On le redit dans la réponse : l'administrateur doit savoir, à
      // l'instant où il valide, que la fiche ne portera pas la mention.
      (overridden ? " — sa fiche ne portera pas « pièces vérifiées »." : ""),
  });
}
