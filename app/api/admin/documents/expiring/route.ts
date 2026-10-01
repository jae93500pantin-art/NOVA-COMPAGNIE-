import { NextResponse } from "next/server";
import { requireAdmin, adminDb } from "@/lib/admin";
import { adminRefusal } from "@/lib/adminHttp";
import { logAdminAction } from "@/lib/adminDocuments";
import { sendEmail, documentExpiringEmail } from "@/lib/email";
import {
  DOCUMENT_LABELS,
  EXPIRY_WARNING_DAYS,
  daysUntilExpiry,
  expiresSoon,
  type DriverDocumentKind,
} from "@/lib/driverDocuments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Rappels d'échéance : prévient les chauffeurs dont une pièce expire bientôt.
 *
 * ## ⚠️ Déclenché, pas automatique
 *
 * Il n'y a pas d'ordonnanceur dans ce dépôt. Cette route est **idempotente** et
 * conçue pour être appelée soit depuis la console d'administration, soit par un
 * cron externe : `expiry_notified_at` garantit qu'un chauffeur reçoit un seul
 * rappel par pièce, même si la route est appelée dix fois par jour.
 *
 * ⚠️ `GET` **ne notifie pas** : il rend seulement l'état, pour que la console
 * puisse l'afficher. Une consultation qui envoie des e-mails est un piège —
 * ouvrir la page deux fois ne doit pas écrire deux fois aux chauffeurs.
 * L'envoi est un `POST`, explicite.
 */

interface Row {
  id: string;
  driver_id: string;
  kind: string;
  expires_at: string | null;
  expiry_notified_at: string | null;
}

/** Les pièces qui expirent bientôt ou viennent d'expirer, avec leur chauffeur. */
async function collect(db: NonNullable<ReturnType<typeof adminDb>>) {
  const { data, error } = await db
    .from("driver_documents")
    .select("id, driver_id, kind, expires_at, expiry_notified_at")
    .not("expires_at", "is", null);

  if (error) {
    console.error(`[échéances] lecture impossible : ${error.message}`);
    return { rows: [] as Row[], profiles: new Map<string, { email: string | null; first_name: string | null }>() };
  }

  const rows = ((data ?? []) as Row[]).filter((r) => {
    const doc = { kind: r.kind, expiresAt: r.expires_at };
    const left = daysUntilExpiry(doc);
    // Bientôt échues, ou échues depuis peu : au-delà, le rappel n'a plus
    // d'objet, la fiche est déjà retirée et le chauffeur l'a constaté.
    return expiresSoon(doc) || (left !== null && left < 0 && left > -30);
  });

  const ids = [...new Set(rows.map((r) => r.driver_id))];
  const profiles = new Map<string, { email: string | null; first_name: string | null }>();
  if (ids.length > 0) {
    const { data: people } = await db
      .from("profiles")
      .select("id, email, first_name")
      .in("id", ids);
    for (const p of (people ?? []) as { id: string; email: string | null; first_name: string | null }[]) {
      profiles.set(p.id, { email: p.email, first_name: p.first_name });
    }
  }
  return { rows, profiles };
}

export async function GET() {
  const guard = await requireAdmin();
  if (guard.state !== "ok") {
    const { status, error } = adminRefusal(guard.state);
    return NextResponse.json({ error }, { status });
  }
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Client indisponible" }, { status: 503 });

  const { rows, profiles } = await collect(db);
  return NextResponse.json({
    warningDays: EXPIRY_WARNING_DAYS,
    documents: rows.map((r) => ({
      driverId: r.driver_id,
      driverName: profiles.get(r.driver_id)?.first_name ?? "",
      kind: r.kind,
      label: DOCUMENT_LABELS[r.kind as DriverDocumentKind]?.label ?? r.kind,
      expiresAt: r.expires_at,
      daysLeft: daysUntilExpiry({ kind: r.kind, expiresAt: r.expires_at }),
      notified: r.expiry_notified_at !== null,
    })),
  });
}

export async function POST() {
  const guard = await requireAdmin();
  if (guard.state !== "ok") {
    const { status, error } = adminRefusal(guard.state);
    return NextResponse.json({ error }, { status });
  }
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Client indisponible" }, { status: 503 });

  const { rows, profiles } = await collect(db);
  // ⚠️ Un seul rappel par pièce : c'est `expiry_notified_at` qui le garantit,
  // pas la prudence de l'appelant.
  const todo = rows.filter((r) => r.expiry_notified_at === null);

  let sent = 0;
  for (const row of todo) {
    const person = profiles.get(row.driver_id);
    const left = daysUntilExpiry({ kind: row.kind, expiresAt: row.expires_at });
    if (!person?.email || left === null) continue;

    const { subject, html } = documentExpiringEmail({
      firstName: person.first_name || "Chauffeur",
      documentLabel: DOCUMENT_LABELS[row.kind as DriverDocumentKind]?.label ?? row.kind,
      expiresAt: row.expires_at ?? "",
      daysLeft: Math.max(0, left),
      resumeUrl: `${new URL("/compte/onboarding", "https://www.novacompagnie.com")}`,
    });

    const ok = await sendEmail({ to: person.email, subject, html });
    // ⚠️ La trace s'écrit même si l'envoi a échoué : sans cela, un e-mail
    // refusé serait retenté à chaque appel, et un chauffeur dont l'adresse est
    // invalide recevrait le même rappel en boucle.
    await db
      .from("driver_documents")
      .update({ expiry_notified_at: new Date().toISOString() })
      .eq("id", row.id);
    if (ok) sent++;
  }

  await logAdminAction(guard.userId, "documents_expiry_notified", {
    candidates: todo.length,
    sent,
  });

  return NextResponse.json({ ok: true, candidates: todo.length, sent });
}
