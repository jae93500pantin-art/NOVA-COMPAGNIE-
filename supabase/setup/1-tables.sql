-- ETAPE 1/3 - Tables de base (extensions, enums, profiles, drivers, bookings).
-- Genere par scripts/compose-schema.ps1 depuis supabase/schema.sql.
-- Ne pas editer ici : toute modification se fait dans schema.sql.
--
-- bookings est cree AVANT reviews, qui le reference par booking_id.

-- ─────────────────────────────────────────────────────────────
-- LumeCar — schéma Supabase (Postgres)
-- Couvre : profils, chauffeurs, véhicules, avis
-- et réservations, avec Row Level Security.
--
-- ⚠️ NE PAS EXÉCUTER CE FICHIER TEL QUEL.
--    Son ordre de lecture n'est pas un ordre d'exécution valide :
--      • `reviews` référence `public.bookings`, déclaré plus bas ;
--      • `booking_chat_is_open()` emploie la valeur d'enum 'paid' ajoutée
--        dans le même fichier — Postgres refuse d'utiliser une valeur d'enum
--        dans la transaction qui l'ajoute ;
--      • les `create policy` et `alter publication` ne sont pas rejouables.
--
--    Exécuter à la place supabase/setup/1-tables.sql, 2-enums.sql puis
--    3-policies-rgpd.sql, régénérés depuis ce fichier par
--    scripts/compose-schema.ps1 et appliqués par scripts/apply-schema.ps1.
--    Ce fichier reste la source de vérité du CONTENU : toute modification se
--    fait ici, puis on relance compose-schema.ps1.
-- ─────────────────────────────────────────────────────────────

-- Extensions
create extension if not exists "uuid-ossp";

-- ── Enums ────────────────────────────────────────────────────
do $$ begin
  create type user_role as enum ('client', 'driver');
exception when duplicate_object then null; end $$;

do $$ begin
  create type vehicle_category as enum ('Business', 'Moto', 'Van', 'Van Luxury', 'Luxury');
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking_status as enum ('pending', 'confirmed', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

-- ── Profiles (1:1 avec auth.users) ───────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        user_role   not null default 'client',
  first_name  text        not null default '',
  last_name   text        not null default '',
  phone       text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- ── Drivers (profil chauffeur étendu) ────────────────────────
create table if not exists public.drivers (
  id               uuid primary key references public.profiles (id) on delete cascade,
  age              int,
  city_id          text        not null,
  bio              text        default '',
  languages        text[]      default '{}',
  experience_years int         default 0,
  categories       vehicle_category[] default '{}',
  -- Trajets « Transfert Aéroport » acceptés (ids de lib/transfer.ts : paris,
  -- cdg, ory, lbg, cdg-paris, ory-paris, lbg-paris). Un client ne voit que les
  -- chauffeurs qui desservent le trajet demandé.
  -- Le chauffeur coche UNE case globale dans son profil : la colonne vaut donc
  -- soit la liste complète, soit '{}'. Volontairement pas de booléen
  -- `accepts_airport_transfers` en plus — deux sources de vérité à garder
  -- synchronisées finissent par diverger, et l'index GIN ci-dessous répond
  -- déjà à « qui dessert CDG ? » sans migration.
  transfer_destinations text[] default '{}',
  -- Tarifs = PRIX CLIENT TTC, saisis par le chauffeur dans la bande de sa
  -- gamme (lib/pricing.ts). La commission plateforme (25 %) est prélevée SUR
  -- ce montant, jamais ajoutée : le client paie le prix affiché.
  -- Standard (Business/Moto/Van) : PRIX FIXE plateforme, non modifiable —
  --          120 €/h et 1000 €/jour pour tous.
  -- Premium  (Luxury/Van Luxury) : saisie libre entre 150–250 €/h
  --          et 1500–3000 €/jour, selon le modèle du chauffeur.
  -- Semaine  : aucun tarif stocké, uniquement sur devis (contact WhatsApp).
  -- La contrainte volontairement large couvre les deux bandes ; la bande
  -- exacte dépend de `categories` et reste appliquée par clampRate() côté
  -- serveur, seule source de vérité (elle évolue sans migration SQL).
  price_per_hour   numeric(10,2) default 0 check (price_per_hour >= 0 and price_per_hour <= 1000),
  price_per_day    numeric(10,2) default 0 check (price_per_day  >= 0 and price_per_day  <= 10000),
  price_per_km     numeric(10,2) default 0,
  available        boolean     default true,
  response_time    text        default '≈ 5 min',
  rating           numeric(3,2) default 5.0,
  reviews_count    int         default 0,
  trips            int         default 0,
  badges           text[]      default '{}',
  -- Géolocalisation temps réel
  lng              double precision,
  lat              double precision,
  car_make         text,
  car_model        text,
  car_year         int,
  car_color        text,
  car_photos       text[]      default '{}',
  created_at       timestamptz not null default now()
);

create index if not exists drivers_city_idx on public.drivers (city_id);
create index if not exists drivers_available_idx on public.drivers (available);
-- « Quels chauffeurs desservent cette destination ? »
--   select * from drivers where transfer_destinations @> array['cdg'];
create index if not exists drivers_transfer_destinations_idx
  on public.drivers using gin (transfer_destinations);

-- Migration d'une base existante :
--   alter table public.drivers
--     add column if not exists transfer_destinations text[] default '{}';
--   alter table public.drivers
--     add column if not exists price_per_day numeric(10,2) default 0;
--   -- Remonter les tarifs journaliers sous le plancher de leur bande :
--   update public.drivers set price_per_day = 1000
--     where price_per_day < 1000 and not (categories && '{Luxury,"Van Luxury"}');
--   update public.drivers set price_per_day = 1500
--     where price_per_day < 1500 and categories && '{Luxury,"Van Luxury"}';

-- ── Bookings ─────────────────────────────────────────────────
create table if not exists public.bookings (
  id          uuid primary key default uuid_generate_v4(),
  client_id   uuid not null references public.profiles (id) on delete cascade,
  driver_id   uuid not null references public.drivers (id) on delete cascade,
  start_at    timestamptz not null,
  hours       int not null default 1,
  total       numeric(10,2) not null default 0,
  status      booking_status not null default 'pending',
  created_at  timestamptz not null default now()
);

