import { NextResponse } from "next/server";
import { requireAdmin, adminDb } from "@/lib/admin";
import { adminRefusal } from "@/lib/adminHttp";
import { logAdminAction } from "@/lib/adminDocuments";
import { QUOTE_RETENTION_MONTHS, quoteRetentionCutoff } from "@/lib/quoteRequest";
import { CONTACT_RETENTION_MONTHS, contactRetentionCutoff } from "@/lib/contactMessage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Supprime les demandes de devis qui ont dépassé leur durée de conservation
 * (`QUOTE_RETENTION_MONTHS`, annoncée sur `/legal/confidentialite`), et
 * les messages de contact dans le même geste (`CONTACT_RETENTION_MONTHS`).
 * ⚠️ Une durée annoncée sur la page de confidentialité qu'aucune purge
 * n'applique ferait mentir la politique.
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

  /**
   * Messages de contact. ⚠️ Un échec ici n'annule pas la purge des devis,
   * déjà faite : la table peut simplement ne pas exister tant que la
   * migration du 2026-10-14 n'est pas passée.
   */
  const contactCutoff = contactRetentionCutoff().toISOString();
  const contact = await db
    .from("contact_messages")
    .delete()
    .lt("created_at", contactCutoff)
    .select("id");
  const deletedContacts = contact.error ? 0 : contact.data?.length ?? 0;
  if (contact.error) {
    console.error(`[admin-quotes] purge des messages de contact refusée : ${contact.error.message}`);
  } else if (deletedContacts > 0) {
    // ⚠️ Sans nom, e-mail ni téléphone : garder les coordonnées d'un message
    // effacé dans le journal viderait l'effacement.
    await logAdminAction(guard.userId, "contact_messages_purged", {
      deleted: deletedContacts,
      cutoff: contactCutoff,
      retention_months: CONTACT_RETENTION_MONTHS,
    });
  }

  return NextResponse.json({ ok: true, deleted, deletedContacts });
}
