import { NextResponse } from "next/server";
import { requireAdmin, adminDb } from "@/lib/admin";
import { adminRefusal } from "@/lib/adminHttp";
import { logAdminAction } from "@/lib/adminDocuments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Suivi d'un message du formulaire `/contact` depuis la console — même
 * modèle que `/api/admin/quotes/[quoteId]`.
 *
 * - `PATCH {handled: boolean}` marque le message traité (ou le rouvre).
 * - `DELETE` le supprime — spam, doublon, ou demande d'effacement.
 *
 * ⚠️ La trace de suppression ne recopie NI le nom, NI l'e-mail, NI le
 * message : effacer un message à la demande de son auteur pour en garder le
 * contenu dans le journal viderait l'effacement de son sens.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function guarded(messageId: string) {
  const guard = await requireAdmin();
  if (guard.state !== "ok") {
    const { status, error } = adminRefusal(guard.state);
    return { response: NextResponse.json({ error }, { status }) } as const;
  }
  const db = adminDb();
  if (!db) {
    return {
      response: NextResponse.json({ error: "Client privilégié indisponible" }, { status: 503 }),
    } as const;
  }
  // Un id mal formé ferait répondre PostgREST 22P02, lu comme une panne.
  if (!UUID_RE.test(messageId)) {
    return {
      response: NextResponse.json({ error: "Message introuvable" }, { status: 404 }),
    } as const;
  }
  return { db, adminId: guard.userId } as const;
}

export async function PATCH(
  request: Request,
  { params }: { params: { messageId: string } }
) {
  const ctx = await guarded(params.messageId);
  if ("response" in ctx) return ctx.response;

  let body: { handled?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête illisible" }, { status: 400 });
  }
  if (typeof body.handled !== "boolean") {
    return NextResponse.json({ error: "Champ « handled » attendu" }, { status: 400 });
  }

  const { data, error } = await ctx.db
    .from("contact_messages")
    .update({ handled_at: body.handled ? new Date().toISOString() : null })
    .eq("id", params.messageId)
    .select("id, handled_at")
    .maybeSingle();

  if (error) {
    console.error(`[admin-contact] mise à jour refusée : ${error.message}`);
    return NextResponse.json({ error: "Mise à jour impossible" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Message introuvable" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, handledAt: data.handled_at });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { messageId: string } }
) {
  const ctx = await guarded(params.messageId);
  if ("response" in ctx) return ctx.response;

  const { data, error } = await ctx.db
    .from("contact_messages")
    .delete()
    .eq("id", params.messageId)
    .select("id, subject, created_at, handled_at")
    .maybeSingle();

  if (error) {
    console.error(`[admin-contact] suppression refusée : ${error.message}`);
    return NextResponse.json({ error: "Suppression impossible" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Message introuvable" }, { status: 404 });
  }

  await logAdminAction(ctx.adminId, "contact_message_deleted", {
    message_id: data.id,
    subject: data.subject,
    created_at: data.created_at,
    handled_at: data.handled_at,
  });

  return NextResponse.json({ ok: true });
}
