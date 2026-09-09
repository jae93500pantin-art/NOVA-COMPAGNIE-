import { NextRequest } from "next/server";
import { getServerUser } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/config";
import { clampRate } from "@/lib/pricing";
import { sanitizeSchedule } from "@/lib/schedule";
import {
  sanitizeTransferDestinationIds,
  transferDestinationsForOptIn,
} from "@/lib/transfer";
import { sanitizeText, rateLimit } from "@/lib/validation";
import type { VehicleCategory } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Le profil public d'un chauffeur : sa fiche d'annuaire.
 *
 *  GET  → sa propre fiche (créée vide si elle n'existe pas encore).
 *  POST → l'enregistre.
 *
 * ## Pourquoi une route, et pas le localStorage
 *
 * `driverOverrides` gardait ces champs dans le navigateur : le profil se
 * perdait d'un appareil à l'autre et n'existait pour personne d'autre que son
 * auteur. Une fiche d'annuaire est par définition publique — elle doit vivre
 * en base.
 *
 * ## Ce que le chauffeur ne décide pas
 *
 * - **Son slug** : posé par l'administrateur à la validation. Le laisser au
 *   chauffeur reviendrait à le laisser choisir la clé qui l'autorise sur une
 *   salle de réservations — il pourrait prendre celle d'un autre.
 * - **Son statut** : `profiles.status`, verrouillé par
 *   `profiles_protect_privileged`.
 * - **Ses tarifs hors bande** : `clampRate` est le dernier mot du serveur, une
 *   gamme standard revient toujours au prix imposé par la plateforme.
 *
 * Un chauffeur **en attente** peut remplir sa fiche : c'est justement ce que
 * l'administrateur doit pouvoir examiner avant de valider. Elle ne devient
 * publique qu'une fois le compte approuvé (`lib/driverDirectory.ts`).
 */

const CATEGORIES: VehicleCategory[] = [
  "Business",
  "Moto",
  "Van",
  "Van Luxury",
  "Luxury",
];

const COLUMNS =
  "id, slug, city_id, bio, languages, experience_years, categories, transfer_destinations, price_per_hour, price_per_day, available, car_make, car_model, car_year, car_color, car_photos, schedule";

/** Session + rôle chauffeur + client privilégié, ou la réponse d'erreur. */
async function guard() {
  const session = await getServerUser();
  if (session.state === "unconfigured") {
    return {
      error: Response.json(
        { error: "Profil chauffeur indisponible : Supabase n'est pas configuré" },
        { status: 503 }
      ),
    } as const;
  }
  if (session.state === "anonymous") {
    return {
      error: Response.json({ error: "Authentification requise" }, { status: 401 }),
    } as const;
  }
  if (session.user.role !== "driver") {
    return {
      error: Response.json({ error: "Compte chauffeur requis" }, { status: 403 }),
    } as const;
  }
  const db = isSupabaseAdminConfigured ? getSupabaseAdmin() : null;
  if (!db) {
    return {
      error: Response.json(
        { error: "Écriture indisponible : SUPABASE_SERVICE_ROLE_KEY manquante" },
        { status: 503 }
      ),
    } as const;
  }
  return { user: session.user, db } as const;
}

export async function GET() {
  const g = await guard();
  if ("error" in g) return g.error;

  const { data, error } = await g.db
    .from("drivers")
    .select(COLUMNS)
    .eq("id", g.user.id)
    .maybeSingle();

  if (error) {
    return Response.json({ error: "Lecture impossible" }, { status: 500 });
  }
  // Pas encore de fiche : on renvoie `null` plutôt qu'un 404. L'absence de
  // fiche est l'état NORMAL d'un chauffeur qui vient de s'inscrire, pas une
  // erreur — le formulaire doit s'ouvrir vide.
  return Response.json({ profile: data ?? null, status: g.user.status });
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (!rateLimit(`driver-profile:${ip}`, 20, 60_000).ok) {
    return Response.json({ error: "Trop de requêtes" }, { status: 429 });
  }

  const g = await guard();
  if ("error" in g) return g.error;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }

  const category = CATEGORIES.includes(body.category as VehicleCategory)
    ? (body.category as VehicleCategory)
    : "Business";

  // Les tarifs sont ramenés dans la bande de la gamme : c'est le dernier mot
  // du serveur, quoi qu'ait envoyé le formulaire.
  const pricePerHour = clampRate(category, "hour", Number(body.pricePerHour));
  const pricePerDay = clampRate(category, "day", Number(body.pricePerDay));

  const photos = Array.isArray(body.carPhotos)
    ? (body.carPhotos as unknown[])
        .filter((p): p is string => typeof p === "string")
        .slice(0, 8)
    : [];

  const year = Number.parseInt(String(body.carYear ?? ""), 10);

  const row = {
    id: g.user.id,
    // Paris uniquement pour l'instant (voir § Mock data dans CLAUDE.md).
    city_id: "paris",
    bio: sanitizeText(body.bio, 600),
    available: body.available === true,
    categories: [category],
    // L'interrupteur unique se déplie en liste complète : c'est la forme
    // stockée, celle que l'index GIN et tous les filtres interrogent déjà.
    transfer_destinations: sanitizeTransferDestinationIds(
      transferDestinationsForOptIn(body.acceptsTransfers === true)
    ),
    price_per_hour: pricePerHour,
    price_per_day: pricePerDay,
    car_make: sanitizeText(body.carMake, 40),
    car_model: sanitizeText(body.carModel, 40),
    car_year: Number.isFinite(year) && year > 1900 ? year : null,
    car_color: sanitizeText(body.carColor, 30),
    car_photos: photos,
    schedule: body.schedule ? sanitizeSchedule(body.schedule as never) : null,
  };

  // `upsert` : la fiche est créée à la première sauvegarde, mise à jour
  // ensuite. Ni `slug` ni statut ne figurent ici — ils ne sont pas au chauffeur.
  const { error } = await g.db.from("drivers").upsert(row, { onConflict: "id" });

  if (error) {
    console.error(`[driver-profile] écriture refusée : ${error.message}`);
    return Response.json({ error: "Enregistrement impossible" }, { status: 500 });
  }

  return Response.json({
    ok: true,
    // Renvoyés parce que le serveur a pu les corriger : le formulaire doit
    // afficher ce qui a RÉELLEMENT été enregistré, pas ce qu'il a envoyé.
    pricePerHour,
    pricePerDay,
  });
}
