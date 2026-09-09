/**
 * Types de la base Supabase.
 *
 * ⚠️ Écrits à la main, et non produits par `supabase gen types`. La génération
 * exige la CLI authentifiée sur le projet distant : la laisser être l'unique
 * chemin rendrait le typage indisponible à quiconque clone le dépôt sans le
 * jeton. La forme suit `supabase/schema.sql`, qui reste la source de vérité —
 * toute colonne ajoutée là-bas doit l'être ici.
 *
 * Pour régénérer depuis le projet distant, si besoin :
 *   npx supabase gen types typescript --project-id <ref> --schema public
 *
 * Conventions respectées :
 *  - `Row` / `Insert` / `Update` par table, comme la CLI les produit, pour
 *    qu'un remplacement par le fichier généré reste indolore.
 *  - `numeric` est typé `number` côté domaine, mais PostgREST le renvoie en
 *    **chaîne** : les lignes brutes passent par `lib/dbRows.ts`, qui convertit.
 *    Ne pas court-circuiter ce passage en lisant `total` directement.
 */

export type UserRole = "client" | "driver" | "admin";

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "refused"
  | "paid"
  | "completed"
  | "cancelled";

export type VehicleCategory =
  | "Business"
  | "Moto"
  | "Van"
  | "Van Luxury"
  | "Luxury";

export type PaymentStatus =
  | "requires_payment_method"
  | "requires_capture"
  | "processing"
  | "succeeded"
  | "canceled"
  | "failed";

export type ProfileStatus = "pending" | "approved" | "rejected";

/** Unité de facturation d'une course (miroir de `BookingUnit`). */
export type BookingUnit = "hour" | "day" | "transfer";

export interface Json {
  [key: string]: string | number | boolean | null | Json | Json[];
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          first_name: string | null;
          last_name: string | null;
          phone: string | null;
          avatar_url: string | null;
          role: UserRole;
          status: ProfileStatus;
          /**
           * Pont vers la fiche publique de `lib/drivers.ts`, l'annuaire
           * n'étant pas encore en base. Posé par un administrateur : le
           * trigger `profiles_protect_privileged` le verrouille comme `role`.
           */
          driver_slug: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          role?: UserRole;
          status?: ProfileStatus;
          driver_slug?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };

      bookings: {
        Row: {
          id: string;
          client_id: string;
          /** Chauffeur désigné par son slug d'annuaire (voir `profiles.driver_slug`). */
          driver_slug: string | null;
          driver_id: string | null;
          client_name: string;
          client_email: string;
          hours: number;
          unit: BookingUnit;
          transfer: string | null;
          /** `numeric` → chaîne via PostgREST. Passer par `rowToBooking`. */
          total: number | string;
          pickup: string;
          dropoff: string;
          /** Heure de prise en charge en heure LOCALE, sans fuseau. */
          when_local: string;
          /** Projection de `when_local`, pour le tri seulement. */
          start_at: string | null;
          status: BookingStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          driver_slug: string;
          driver_id?: string | null;
          client_name?: string;
          client_email?: string;
          hours?: number;
          unit?: BookingUnit;
          transfer?: string | null;
          total?: number;
          pickup?: string;
          dropoff?: string;
          when_local?: string;
          start_at?: string | null;
          status?: BookingStatus;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["bookings"]["Insert"]>;
      };

      /** Fil de discussion d'une course. Une conversation n'existe que par elle. */
      messages: {
        Row: {
          id: string;
          booking_id: string;
          /** Compte auteur — pas l'id de partie affiché par l'interface. */
          sender_id: string;
          sender_role: "client" | "driver";
          sender_name: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          sender_id: string;
          sender_role?: "client" | "driver";
          sender_name?: string;
          body: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
      };

      reviews: {
        Row: {
          id: string;
          driver_slug: string | null;
          driver_id: string | null;
          author_id: string | null;
          author_name: string;
          /** Unique : une course, un avis. La contrainte est en base. */
          booking_id: string | null;
          rating: number | string;
          comment: string;
          trip: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          driver_slug: string;
          driver_id?: string | null;
          author_id?: string | null;
          author_name?: string;
          booking_id?: string | null;
          rating: number;
          comment: string;
          trip?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["reviews"]["Insert"]>;
      };

      vehicles: {
        Row: {
          id: string;
          driver_slug: string;
          owner_id: string | null;
          category: VehicleCategory;
          make: string;
          model: string;
          year: number | null;
          color: string | null;
          /** Donnée personnelle indirecte : jamais exposée publiquement. */
          plate: string | null;
          seats: number | null;
          photos: string[];
          is_primary: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          driver_slug: string;
          owner_id?: string | null;
          category: VehicleCategory;
          make: string;
          model: string;
          year?: number | null;
          color?: string | null;
          plate?: string | null;
          seats?: number | null;
          photos?: string[];
          is_primary?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["vehicles"]["Insert"]>;
      };

      /** Reflet de `PRICE_BANDS` (lib/pricing.ts), qui reste l'autorité. */
      pricing_rules: {
        Row: {
          category: VehicleCategory;
          min_hour: number | string;
          max_hour: number | string;
          min_day: number | string;
          max_day: number | string;
          commission_rate: number | string;
          updated_at: string;
        };
        Insert: {
          category: VehicleCategory;
          min_hour: number;
          max_hour: number;
          min_day: number;
          max_day: number;
          commission_rate?: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pricing_rules"]["Insert"]>;
      };

      payments: {
        Row: {
          id: string;
          booking_id: string;
          stripe_payment_intent_id: string | null;
          amount_cents: number;
          currency: string;
          status: PaymentStatus;
          capture_method: "manual" | "automatic";
          commission_cents: number;
          last_error: string | null;
          authorized_at: string | null;
          captured_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          stripe_payment_intent_id?: string | null;
          amount_cents: number;
          currency?: string;
          status?: PaymentStatus;
          capture_method?: "manual" | "automatic";
          commission_cents?: number;
          last_error?: string | null;
          authorized_at?: string | null;
          captured_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
      };
    };

    Functions: {
      /**
       * Prix d'une course, côté base. Reflète `computeAmount` + `clampRate`.
       * Renvoie UNE ligne (`returns table`), donc un tableau via PostgREST.
       */
      calculate_booking_price: {
        Args: {
          p_category: VehicleCategory;
          p_unit: BookingUnit;
          p_quantity?: number;
          p_price_per_hour?: number | null;
          p_price_per_day?: number | null;
          p_transfer_fare?: number | null;
        };
        Returns: BookingPriceRow[];
      };
    };

    Enums: {
      user_role: UserRole;
      booking_status: BookingStatus;
      vehicle_category: VehicleCategory;
      payment_status: PaymentStatus;
    };
  };
}

/** Une ligne renvoyée par `calculate_booking_price`. `numeric` → chaîne. */
export interface BookingPriceRow {
  quantity: number;
  unit_price: number | string;
  total_ttc: number | string;
  commission: number | string;
  driver_net: number | string;
  amount_cents: number;
}

/* Raccourcis de lecture, pour éviter les chemins d'indexation partout. */
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type InsertDto<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type UpdateDto<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
