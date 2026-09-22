import type { WeeklySchedule } from "./schedule";

export type VehicleCategory = "Business" | "Moto" | "Van" | "Van Luxury" | "Luxury";

export interface City {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  image: string;
  driversCount: number;
  /** Relative coordinates (0-100) used to position pins on the stylised map. */
  mapX: number;
  mapY: number;
  primary?: boolean;
}

export interface Review {
  id: string;
  author: string;
  avatar: string;
  rating: number;
  date: string;
  comment: string;
  trip?: string;
}

export interface Driver {
  id: string;
  firstName: string;
  lastName: string;
  age: number;
  avatar: string;
  cityId: string;
  rating: number;
  reviewsCount: number;
  trips: number;
  languages: string[];
  experienceYears: number;
  car: {
    make: string;
    model: string;
    year: number;
    color: string;
    photos: string[];
  };
  categories: VehicleCategory[];
  /**
   * Transfer destination ids (lib/transfer.ts) the driver ticked in their
   * profile. The airport-transfer flow only proposes drivers listed here.
   */
  transferDestinations: string[];
  /**
   * Carte professionnelle CNAPS vérifiée — une **qualification du chauffeur**,
   * pas une prestation de la plateforme (voir `lib/cnaps.ts`).
   *
   * ⚠️ **Décision d'administration**, jamais une déclaration : le chauffeur
   * dépose sa carte, un administrateur l'examine, et la valeur est recalculée
   * depuis le statut de la pièce (`refresh_cnaps_verified`).
   *
   * ⚠️ Cette valeur n'ouvre **aucun** droit à réserver quoi que ce soit
   * d'autre qu'une course VTC : Nova Compagnie n'a pas d'autorisation
   * d'exercer CNAPS et ne peut donc pas commercialiser d'activité de sécurité
   * privée (art. L612-2 CSI). Les drapeaux `isVtc` / `isSecurity` qui
   * vivaient ici portaient cet axe de prestation : ils ont été retirés.
   */
  cnapsVerified: boolean;
  /** Online right now — about immediate rides only, never about bookings ahead. */
  available: boolean;
  /**
   * Weekly hours the driver accepts bookings for (lib/schedule.ts).
   * Absent = no constraint; see `scheduleOf()`.
   */
  schedule?: WeeklySchedule;
  responseTime: string;
  pricePerHour: number;
  /** Fixed daily rate (euros) based on the vehicle model/category. */
  pricePerDay: number;
  pricePerKm: number;
  bio: string;
  badges: string[];
  /** Relative coordinates (0-100) used to position the live pin on the map. */
  mapX: number;
  mapY: number;
  /** Optional real-world coordinates (populated when backed by Supabase). */
  lng?: number;
  lat?: number;
  reviews: Review[];
}
