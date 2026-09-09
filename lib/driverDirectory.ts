import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/config";
import { sanitizeSchedule, type WeeklySchedule } from "@/lib/schedule";
import { clampRate } from "@/lib/pricing";
import { sanitizeTransferDestinationIds } from "@/lib/transfer";
import type { Driver, VehicleCategory } from "@/lib/types";

/**
 * L'annuaire des chauffeurs, lu en base.
 *
 * `lib/drivers.ts` est vide : les profils inventés ont été retirés. Un
 * chauffeur n'apparaît ici que s'il s'est inscrit ET qu'un administrateur l'a
 * validé.
 *
 * ## Pourquoi le service role plutôt que la clé anon
 *
 * `drivers` est en lecture publique, mais le STATUT de validation vit dans
 * `profiles`, que la RLS restreint à son propriétaire. Une lecture anon sur
 * `drivers` seule publierait donc les chauffeurs **en attente de validation** —
 * exactement ce que la validation sert à empêcher. On lit les deux tables avec
 * le service role et on ne retient que les profils `approved`.
 *
 * ⚠️ Ne pas « simplifier » en lisant `drivers` avec la clé anon.
 *
 * ## Dégradation gracieuse
 *
 * Sans clé de service, l'annuaire est vide plutôt qu'en erreur : la démo sans
 * configuration affiche ses états vides et continue de fonctionner.
 */

const CATEGORIES: VehicleCategory[] = [
  "Business",
  "Moto",
  "Van",
  "Van Luxury",
  "Luxury",
];

interface DriverRow {
  id: string;
  slug: string | null;
  age: number | null;
  city_id: string;
  bio: string | null;
  languages: string[] | null;
  experience_years: number | null;
  categories: string[] | null;
  transfer_destinations: string[] | null;
  price_per_hour: number | string | null;
  price_per_day: number | string | null;
  price_per_km: number | string | null;
  available: boolean | null;
  response_time: string | null;
  rating: number | string | null;
  reviews_count: number | null;
  trips: number | null;
  badges: string[] | null;
  lng: number | null;
  lat: number | null;
  car_make: string | null;
  car_model: string | null;
  car_year: number | null;
  car_color: string | null;
  car_photos: string[] | null;
  schedule: unknown;
}

interface ProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  status: string | null;
}

const COLUMNS =
  "id, slug, age, city_id, bio, languages, experience_years, categories, transfer_destinations, price_per_hour, price_per_day, price_per_km, available, response_time, rating, reviews_count, trips, badges, lng, lat, car_make, car_model, car_year, car_color, car_photos, schedule";

function db() {
  return isSupabaseAdminConfigured ? getSupabaseAdmin() : null;
}

/** Tous les chauffeurs validés, ou une liste vide si la base est absente. */
export async function listDirectory(): Promise<Driver[]> {
  const client = db();
  if (!client) return [];

  const { data: rows, error } = await client.from("drivers").select(COLUMNS);
  if (error) {
    console.error(`[annuaire] lecture impossible : ${error.message}`);
    return [];
  }
  const drivers = (rows ?? []) as unknown as DriverRow[];
  if (drivers.length === 0) return [];

  // Le statut n'est pas dans `drivers` : il faut le profil pour savoir qui est
  // publiable. Une seule requête pour tout le lot, pas une par chauffeur.
  const { data: profileRows, error: profileError } = await client
    .from("profiles")
    .select("id, first_name, last_name, avatar_url, status")
    .in(
      "id",
      drivers.map((d) => d.id)
    );
  if (profileError) {
    console.error(`[annuaire] profils illisibles : ${profileError.message}`);
    return [];
  }

  const profiles = new Map(
    ((profileRows ?? []) as ProfileRow[]).map((p) => [p.id, p])
  );

  return drivers
    .map((row) => {
      const profile = profiles.get(row.id);
      // Pas de profil, pas validé, ou pas de slug : invisible. Un chauffeur
      // sans slug n'a de toute façon aucune URL ni salle de réservations.
      if (!profile || profile.status !== "approved" || !row.slug) return null;
      return toDriver(row, profile);
    })
    .filter((d): d is Driver => d !== null);
}

/** Un chauffeur validé par son slug, ou `null`. */
export async function getDirectoryDriver(slug: string): Promise<Driver | null> {
  const client = db();
  if (!client || !slug) return null;

  const { data: row, error } = await client
    .from("drivers")
    .select(COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  if (error || !row) return null;

  const { data: profile } = await client
    .from("profiles")
    .select("id, first_name, last_name, avatar_url, status")
    .eq("id", (row as unknown as DriverRow).id)
    .maybeSingle();

  const p = profile as ProfileRow | null;
  if (!p || p.status !== "approved") return null;
  return toDriver(row as unknown as DriverRow, p);
}

/** Les slugs publiables — pour `generateStaticParams` et les sitemaps. */
export async function listDirectorySlugs(): Promise<string[]> {
  return (await listDirectory()).map((d) => d.id);
}

/* -------------------------------------------------------------------------- */

/**
 * Ligne Postgres → `Driver`.
 *
 * `Driver.id` porte le **slug**, pas l'uuid : c'est cet identifiant que les
 * URL, les réservations, le chat et les avis manipulent déjà.
 *
 * Les tarifs sont re-clampés dans la bande de leur gamme à la lecture : un
 * tarif écrit avant un changement de barème ne doit jamais s'afficher, ni
 * surtout se facturer, hors bande.
 */
function toDriver(row: DriverRow, profile: ProfileRow): Driver {
  const categories = (row.categories ?? []).filter((c): c is VehicleCategory =>
    CATEGORIES.includes(c as VehicleCategory)
  );
  const category = categories[0];

  return {
    id: row.slug as string,
    firstName: profile.first_name ?? "",
    lastName: profile.last_name ?? "",
    age: row.age ?? 0,
    avatar: profile.avatar_url ?? "",
    cityId: row.city_id,
    rating: num(row.rating, 5),
    reviewsCount: row.reviews_count ?? 0,
    trips: row.trips ?? 0,
    languages: row.languages ?? [],
    experienceYears: row.experience_years ?? 0,
    car: {
      make: row.car_make ?? "",
      model: row.car_model ?? "",
      year: row.car_year ?? 0,
      color: row.car_color ?? "",
      photos: row.car_photos ?? [],
    },
    categories,
    transferDestinations: sanitizeTransferDestinationIds(
      row.transfer_destinations
    ),
    available: row.available ?? false,
    schedule: readSchedule(row.schedule),
    responseTime: row.response_time ?? "≈ 5 min",
    pricePerHour: clampRate(category, "hour", num(row.price_per_hour, 0)),
    pricePerDay: clampRate(category, "day", num(row.price_per_day, 0)),
    pricePerKm: num(row.price_per_km, 0),
    bio: row.bio ?? "",
    badges: row.badges ?? [],
    // L'annuaire en base porte de vraies coordonnées ; les offsets de la carte
    // stylisée n'ont plus lieu d'être devinés, `driverCoords` préfère lng/lat.
    mapX: 50,
    mapY: 50,
    lng: row.lng ?? undefined,
    lat: row.lat ?? undefined,
    reviews: [],
  };
}

/** `jsonb` illisible ou absent → aucune contrainte d'horaires. */
function readSchedule(raw: unknown): WeeklySchedule | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  try {
    return sanitizeSchedule(raw as WeeklySchedule);
  } catch {
    return undefined;
  }
}

function num(raw: number | string | null | undefined, fallback: number) {
  if (typeof raw === "string" && raw.trim() === "") return fallback;
  const n = typeof raw === "string" ? Number(raw) : raw;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}
