import { NextResponse } from "next/server";
import { requireAdmin, adminDb } from "@/lib/admin";
import { adminRefusal } from "@/lib/adminHttp";
import { logAdminAction } from "@/lib/adminDocuments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Suivi d'une demande de devis depuis la console.
 *
 * - `PATCH {handled: boolean}` marque la demande traitée (ou la rouvre).
 * - `DELETE` la supprime — doublon, spam, ou demande d'effacement du client.
 *
 * ⚠️ Aucune de ces actions ne touche à un prix ni à un créneau : la table n'en
 * porte pas (§ Demande de devis). « Traitée » veut dire « transmise au
 * chauffeur ou au client », pas « course confirmée ».
 *
 * ⚠️ La trace de suppression ne recopie NI le nom, NI l'e-mail, NI le
 * téléphone : effacer une demande à la demande du client pour en garder les
 * coordonnées dans le journal viderait l'effacement de son sens.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function guarded(quoteId: string) {
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
  if (!UUID_RE.test(quoteId)) {
    return {
      response: NextResponse.json({ error: "Demande introuvable" }, { status: 404 }),
    } as const;
  }
  return { db, adminId: guard.userId } as const;
}

export async function PATCH(
  request: Request,
  { params }: { params: { quoteId: string } }
) {
  const ctx = await guarded(params.quoteId);
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
    .from("quote_requests")
    .update({ handled_at: body.handled ? new Date().toISOString() : null })
    .eq("id", params.quoteId)
    .select("id, handled_at")
    .maybeSingle();

  if (error) {
    console.error(`[admin-quotes] mise à jour refusée : ${error.message}`);
    return NextResponse.json({ error: "Mise à jour impossible" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, handledAt: data.handled_at });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { quoteId: string } }
) {
  const ctx = await guarded(params.quoteId);
  if ("response" in ctx) return ctx.response;

  const { data, error } = await ctx.db
    .from("quote_requests")
    .delete()
    .eq("id", params.quoteId)
    .select("id, driver_slug, created_at, handled_at")
    .maybeSingle();

  if (error) {
    console.error(`[admin-quotes] suppression refusée : ${error.message}`);
    return NextResponse.json({ error: "Suppression impossible" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
  }

  await logAdminAction(ctx.adminId, "quote_deleted", {
    quote_id: data.id,
    driver_slug: data.driver_slug,
    created_at: data.created_at,
    handled_at: data.handled_at,
  });

  return NextResponse.json({ ok: true });
}
