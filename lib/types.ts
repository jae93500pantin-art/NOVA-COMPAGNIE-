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
  available: boolean;
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
