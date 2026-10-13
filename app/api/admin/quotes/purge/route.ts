import { NextResponse } from "next/server";
import { requireAdmin, adminDb } from "@/lib/admin";
import { adminRefusal } from "@/lib/adminHttp";
import { logAdminAction } from "@/lib/adminDocuments";
import { QUOTE_RETENTION_MONTHS, quoteRetentionCutoff } from "@/lib/quoteRequest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Supprime les demandes de devis qui ont dépassé leur durée de conservation
 * (`QUOTE_RETENTION_MONTHS`, annoncée sur `/legal/confidentialite`).
 *
 * ⚠️ POST, déclenché par un bouton — jamais à l'ouverture de la console : une
 * consultation qui supprime des données est un piège, comme l'est une
 * consultation qui envoie des e-mails (`/api/admin/documents/expiring`).
 */
export async function POST() {
  const guard = await requireAdmin();
  if (guard.state !== "ok") {
    const { status, error } = adminRefusal(guard.state);
    return NextResponse.json({ error }, { status });
  }
  const db = adminDb();
  if (!db) {
    return NextResponse.json({ error: "Client privilégié indisponible" }, { status: 503 });
  }

  const cutoff = quoteRetentionCutoff().toISOString();
  const { data, error } = await db
    .from("quote_requests")
    .delete()
    .lt("created_at", cutoff)
    .select("id");

  if (error) {
    console.error(`[admin-quotes] purge refusée : ${error.message}`);
    return NextResponse.json({ error: "Purge impossible" }, { status: 500 });
  }

  const deleted = data?.length ?? 0;
  if (deleted > 0) {
    await logAdminAction(guard.userId, "quotes_purged", {
      deleted,
      cutoff,
      retention_months: QUOTE_RETENTION_MONTHS,
    });
  }
  return NextResponse.json({ ok: true, deleted });
}
