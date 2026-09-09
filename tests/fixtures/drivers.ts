import type { Driver, VehicleCategory } from "@/lib/types";
import { ALL_TRANSFER_DESTINATION_IDS } from "@/lib/transfer";

/**
 * Chauffeurs de test.
 *
 * L'annuaire public (`lib/drivers.ts`) est **vide** : les profils inventés ont
 * été retirés, un site marchand accessible ne pouvant pas présenter de faux
 * professionnels ni de faux avis. Les tests qui s'appuyaient dessus testaient
 * en réalité des fonctions pures — tarification, filtrage des transferts,
 * surcharges de profil — et non les données elles-mêmes.
 *
 * Ces fixtures leur rendent une matière stable, et le font mieux : elles ne
 * bougeront pas quand un vrai chauffeur s'inscrira, alors qu'un test lisant
 * l'annuaire réel deviendrait dépendant du contenu de la base.
 *
 * Couverture voulue : les cinq gammes, un tarif standard imposé et un tarif
 * premium libre, un chauffeur qui accepte les transferts et un qui les refuse.
 */

const PHOTO = "https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=1200";

function makeDriver(
  id: string,
  categories: VehicleCategory[],
  pricePerHour: number,
  pricePerDay: number,
  transfers: string[],
  extra: Partial<Driver> = {}
): Driver {
  // Offsets deterministes tires de l.id : `driverCoords` les utilise pour
  // disperser les pions, et deux fixtures au meme point se superposeraient.
  const seed = [...id].reduce((n, c) => n + c.charCodeAt(0), 0);
  return {
    id,
    firstName: "Prénom",
    lastName: "Nom",
    age: 38,
    avatar: "https://i.pravatar.cc/300?u=" + id,
    cityId: "paris",
    rating: 4.8,
    reviewsCount: 12,
    trips: 340,
    languages: ["Français", "Anglais"],
    experienceYears: 9,
    car: {
      make: "Mercedes-Benz",
      model: "Classe S",
      year: 2023,
      color: "Noir",
      photos: [PHOTO],
    },
    categories,
    transferDestinations: transfers,
    available: true,
    responseTime: "≈ 5 min",
    pricePerHour,
    pricePerDay,
    pricePerKm: 2.5,
    bio: "Chauffeur de test.",
    badges: ["Vérifié"],
    mapX: 20 + (seed % 61),
    mapY: 20 + ((seed * 7) % 61),
    reviews: [],
    ...extra,
  };
}

/** Gamme premium, tarif libre dans la bande 150–250 € / 1500–3000 €. */
export const LUXURY_DRIVER = makeDriver(
  "fixture-luxury",
  ["Luxury"],
  220,
  2400,
  ALL_TRANSFER_DESTINATION_IDS,
  { car: { make: "Mercedes-AMG", model: "E63 S", year: 2024, color: "Noir", photos: [PHOTO] } }
);

/** Gamme standard : tarif imposé par la plateforme (bande de largeur nulle). */
export const BUSINESS_DRIVER = makeDriver(
  "fixture-business",
  ["Business"],
  120,
  1000,
  ALL_TRANSFER_DESTINATION_IDS
);

/** Celui qui n'accepte AUCUN transfert — le cas que le filtrage doit exclure. */
export const NO_TRANSFER_DRIVER = makeDriver(
  "fixture-no-transfer",
  ["Business"],
  120,
  1000,
  []
);

export const VAN_DRIVER = makeDriver(
  "fixture-van",
  ["Van"],
  120,
  1000,
  ALL_TRANSFER_DESTINATION_IDS,
  { car: { make: "Mercedes-Benz", model: "Classe V", year: 2023, color: "Noir", photos: [PHOTO] } }
);

export const MOTO_DRIVER = makeDriver(
  "fixture-moto",
  ["Moto"],
  120,
  1000,
  ALL_TRANSFER_DESTINATION_IDS
);

export const VAN_LUXURY_DRIVER = makeDriver(
  "fixture-van-luxury",
  ["Van Luxury"],
  180,
  1800,
  ALL_TRANSFER_DESTINATION_IDS
);

/** Les cinq gammes + un chauffeur hors transferts. */
export const FIXTURE_DRIVERS: Driver[] = [
  LUXURY_DRIVER,
  BUSINESS_DRIVER,
  VAN_DRIVER,
  MOTO_DRIVER,
  VAN_LUXURY_DRIVER,
  NO_TRANSFER_DRIVER,
];

export const fixtureDriver = (id: string): Driver | undefined =>
  FIXTURE_DRIVERS.find((d) => d.id === id);
