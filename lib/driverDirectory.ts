import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/config";
import { sanitizeSchedule, type WeeklySchedule } from "@/lib/schedule";
import { clampRate, isRateAcceptable } from "@/lib/pricing";
import {
  hasExpiredRequired,
  allRequiredChecked,
} from "@/lib/driverDocuments";
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
  cnaps_verified: boolean | null;
  available: boolean | null;
  response_time: string | null;
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
  /** Absent tant que la colonne n'existe pas en base (voir PROFILE_COLUMNS). */
  airport_flat_rate?: number | string | null;
}

/**
 * ⚠️ `airport_flat_rate` vit sur `profiles`, pas sur `drivers` : la colonne
 * a été ajoutée là en base le 2026-10-12. On la lit avec le profil, qu'on lit
 * de toute façon pour le statut de validation.
 */
const PROFILE_COLUMNS = "id, first_name, last_name, avatar_url, status, airport_flat_rate";
/** Repli si la colonne manque (base non migrée) : l'annuaire reste lisible,
 *  sans forfait, au lieu de se vider sur une erreur 42703. */
const PROFILE_COLUMNS_LEGACY = "id, first_name, last_name, avatar_url, status";

/**
 * ⚠️ Ni `rating`, ni `reviews_count`, ni `trips` : rien ne les lit (la note se
 * calcule sur les avis présents), et la migration du 2026-09-28 les supprime.
 * Les nommer ici ferait répondre 42703 à toute lecture de l'annuaire le jour
 * où elle passe — un annuaire vide, sans erreur visible.
 */
const COLUMNS =
  "id, slug, age, city_id, bio, languages, experience_years, categories, transfer_destinations, cnaps_verified, price_per_hour, price_per_day, price_per_km, available, response_time, badges, lng, lat, car_make, car_model, car_year, car_color, car_photos, schedule";

function db() {
  return isSupabaseAdminConfigured ? getSupabaseAdmin() : null;
}

/** Tous les chauffeurs validés, ou une liste vide si la base est absente. */
/** L'ancienne valeur par défaut de `drivers.response_time`, jamais déclarée. */
const RESPONSE_TIME_DB_DEFAULT = "≈ 5 min";

function declaredResponseTime(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  return v && v !== RESPONSE_TIME_DB_DEFAULT ? v : null;
}

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
  const ids = drivers.map((d) => d.id);
  const readProfiles = (columns: string) =>
    client.from("profiles").select(columns).in("id", ids);
  let { data: profileRows, error: profileError } = await readProfiles(PROFILE_COLUMNS);
  if (profileError?.code === "42703") {
    ({ data: profileRows, error: profileError } = await readProfiles(PROFILE_COLUMNS_LEGACY));
  }
  if (profileError) {
    console.error(`[annuaire] profils illisibles : ${profileError.message}`);
    return [];
  }

  const profiles = new Map(
    ((profileRows ?? []) as unknown as ProfileRow[]).map((p) => [p.id, p])
  );

  const { expired, verified } = await documentState(
    client,
    drivers.map((d) => d.id)
  );

  return drivers
    .map((row) => {
      const profile = profiles.get(row.id);
      // Pas de profil, pas validé, ou pas de slug : invisible. Un chauffeur
      // sans slug n'a de toute façon aucune URL ni salle de réservations.
      if (!profile || profile.status !== "approved" || !row.slug) return null;
      // Pièce obligatoire périmée : la fiche se retire d'elle-même.
      if (expired.has(row.id)) return null;
      const driver = toDriver(row, profile, verified.has(row.id));
      return isListable(driver) ? driver : null;
    })
    .filter((d): d is Driver => d !== null);
}

/**
 * Une fiche est-elle publiable ?
 *
 * ⚠️ **Un tarif est obligatoire pour paraître.** Depuis que la plateforme
 * n'impose plus aucun prix, `clampRate` ne remonte plus un tarif absent à un
 * plancher : il rend 0. Sans ce contrôle, un chauffeur validé avant d'avoir
 * rempli son dossier apparaîtrait donc à « 0 € / h », et l'ancienne version le
 * publiait à 120 €/h — un prix que personne n'avait choisi. Les deux sont
 * indéfendables sur un annuaire, dont le seul rôle est de rapporter ce que le
 * professionnel a annoncé.
 *
 * Traité comme un dossier incomplet, donc : invisible jusqu'à ce que le tarif
 * soit saisi, exactement comme un profil non validé. La validation par un
 * administrateur ne suffit pas à publier une fiche vide.
 */
function isListable(driver: Driver): boolean {
  return driver.pricePerHour > 0 || driver.pricePerDay > 0;
}

/**
 * L'identifiant **de compte** d'un chauffeur publiable, depuis son slug.
 *
 * ⚠️ Pourquoi cette fonction existe : `Driver.id` porte le **slug**, parce que
 * c'est lui que les URL manipulent — mais `reviews.driver_id` et
 * `quote_requests.driver_id` référencent `drivers (id)`, c'est-à-dire l'**uuid
 * du compte**. Sans traduction, une route qui enregistre un avis écrirait le
 * slug dans une colonne uuid et échouerait à l'insertion.
 *
 * ⚠️ Elle applique **les mêmes filtres que la fiche publique** (validé, non
 * périmé, tarif annoncé) : accepter un avis ou une demande de devis sur un
 * chauffeur qui répond 404 créerait des lignes rattachées à une fiche
 * invisible, que personne ne lira jamais.
 */
export async function getDirectoryDriverAccountId(
  slug: string
): Promise<string | null> {
  const driver = await getDirectoryDriver(slug);
  if (!driver) return null;

  const client = db();
  if (!client) return null;
  const { data } = await client
    .from("drivers")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
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

  const readProfile = (columns: string) =>
    client
      .from("profiles")
      .select(columns)
      .eq("id", (row as unknown as DriverRow).id)
      .maybeSingle();
  let { data: profile, error: profileError } = await readProfile(PROFILE_COLUMNS);
  if (profileError?.code === "42703") {
    ({ data: profile } = await readProfile(PROFILE_COLUMNS_LEGACY));
  }

  const p = profile as unknown as ProfileRow | null;
  if (!p || p.status !== "approved") return null;

  // Même règle que la liste : une pièce obligatoire périmée répond 404, elle
  // ne laisse pas la fiche accessible par son URL directe.
  const { expired, verified } = await documentState(client, [p.id]);
  if (expired.has(p.id)) return null;

  const driver = toDriver(row as unknown as DriverRow, p, verified.has(p.id));
  return isListable(driver) ? driver : null;
}

/**
 * Les chauffeurs dont une pièce OBLIGATOIRE a expiré.
 *
 * ⚠️ **Retrait automatique, pas refus.** Un chauffeur dont l'assurance a expiré
 * hier n'est pas un fraudeur : il est hors des conditions. Sa fiche disparaît
 * de l'annuaire, il redépose, elle revient. Laisser paraître une fiche dont
 * l'assurance a expiré, en revanche, c'est afficher « habilitations vérifiées »
 * sur un professionnel qui ne l'est plus.
 *
 * Une seule requête pour tout le lot, et seulement sur les pièces qui portent
 * une échéance — l'index partiel `driver_documents_expiry_idx` est fait pour.
 */
async function documentState(
  client: NonNullable<ReturnType<typeof db>>,
  ids: string[]
): Promise<{ expired: Set<string>; verified: Set<string> }> {
  const empty = { expired: new Set<string>(), verified: new Set<string>() };
  if (ids.length === 0) return empty;

  // ⚠️ `checked_ok` n'existe qu'après la migration du 2026-09-29 : on tente,
  // puis on replie. Sans le repli, l'erreur ferait croire qu'aucun chauffeur
  // n'a d'échéance — donc qu'aucune fiche n'est à retirer.
  type PieceRow = {
    driver_id: string;
    kind: string;
    expires_at: string | null;
    checked_ok?: boolean | null;
  };
  const read = async (columns: string) => {
    const res = await client
      .from("driver_documents")
      .select(columns)
      .in("driver_id", ids);
    // Les deux variantes n'ont pas la même forme : on les ramène à la plus
    // large, `checked_ok` restant simplement absent dans le repli.
    return {
      data: (res.data ?? null) as unknown as PieceRow[] | null,
      error: res.error,
    };
  };

  let verifiable = true;
  let { data, error } = await read("driver_id, kind, expires_at, checked_ok");

  if (error) {
    verifiable = false;
    ({ data, error } = await read("driver_id, kind, expires_at"));
  }

  if (error) {
    // ⚠️ En cas d'échec, on ne retire personne et on ne certifie personne.
    // Vider l'annuaire parce qu'une requête annexe a échoué serait une panne
    // bien pire que le risque qu'elle couvre ; et accorder la mention par
    // défaut serait exactement le mensonge qu'on cherche à éviter.
    console.error(`[annuaire] pièces illisibles : ${error.message}`);
    return empty;
  }

  const byDriver = new Map<
    string,
    { kind: string; expiresAt: string | null; checkedOk: boolean }[]
  >();
  for (const row of (data ?? []) as {
    driver_id: string;
    kind: string;
    expires_at: string | null;
    checked_ok?: boolean | null;
  }[]) {
    const list = byDriver.get(row.driver_id) ?? [];
    list.push({
      kind: row.kind,
      expiresAt: row.expires_at,
      checkedOk: row.checked_ok === true,
    });
    byDriver.set(row.driver_id, list);
  }

  const expired = new Set<string>();
  const verified = new Set<string>();
  for (const [id, docs] of byDriver) {
    if (hasExpiredRequired(docs)) expired.add(id);
    // ⚠️ Sans les colonnes de contrôle, PERSONNE n'est marqué vérifié. Le
    // défaut doit être « non vérifié » : une mention de contrôle accordée par
    // défaut ne vaut rien, et c'est elle qui engage la plateforme.
    if (verifiable && allRequiredChecked(docs)) verified.add(id);
  }
  return { expired, verified };
}

/** Les slugs publiables — pour un futur sitemap (plus de `generateStaticParams` : voir /drivers/[id]). */
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
function toDriver(
  row: DriverRow,
  profile: ProfileRow,
  documentsVerified: boolean
): Driver {
  const categories = (row.categories ?? []).filter((c): c is VehicleCategory =>
    CATEGORIES.includes(c as VehicleCategory)
  );
  const category = categories[0];

  return {
    id: row.slug as string,
    firstName: profile.first_name ?? "",
    lastName: profile.last_name ?? "",
    age: row.age && row.age > 0 ? row.age : null,
    avatar: profile.avatar_url ?? "",
    cityId: row.city_id,
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
    // Qualification personnelle du chauffeur, posée par l'administration.
    // Elle n'ouvre aucune prestation : voir lib/cnaps.ts.
    cnapsVerified: row.cnaps_verified ?? false,
    available: row.available ?? false,
    schedule: readSchedule(row.schedule),
    // ⚠️ Aucune valeur par défaut : voir `Driver.responseTime`. Et la
    // colonne vaut « ≈ 5 min » PAR DÉFAUT en base, alors qu'aucun écran ne la
    // fait remplir au chauffeur : cette valeur-là n'a été déclarée par
    // personne, elle est écartée (même piège que `drivers.rating` à 5.0).
    responseTime: declaredResponseTime(row.response_time),
    pricePerHour: clampRate("hour", num(row.price_per_hour, 0)),
    pricePerDay: clampRate("day", num(row.price_per_day, 0)),
    pricePerKm: num(row.price_per_km, 0),
    // ⚠️ Hors bornes = non communiqué (0), PAS ramené au plafond : `profiles`
    // est modifiable par son propriétaire via PostgREST, donc une valeur peut
    // arriver ici sans être passée par la route qui valide.
    airportFlatRate: (() => {
      const v = num(profile.airport_flat_rate ?? null, 0);
      return isRateAcceptable("transfer", v) ? Math.round(v) : 0;
    })(),
    bio: row.bio ?? "",
    badges: row.badges ?? [],
    // L'annuaire en base porte de vraies coordonnées ; les offsets de la carte
    // stylisée n'ont plus lieu d'être devinés, `driverCoords` préfère lng/lat.
    mapX: 50,
    mapY: 50,
    lng: row.lng ?? undefined,
    lat: row.lat ?? undefined,
    documentsVerified,
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
