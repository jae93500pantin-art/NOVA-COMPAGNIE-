-- ─────────────────────────────────────────────────────────────
-- LumeCar — schéma Supabase (Postgres)
-- À exécuter dans Supabase → SQL Editor.
-- Couvre : profils, chauffeurs, véhicules, avis
-- et réservations, avec Row Level Security.
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
  -- Destinations « Transfert Aéroport » acceptées (ids de lib/transfer.ts :
  -- paris, cdg, ory, lbg). Un client ne voit que les chauffeurs qui l'ont cochée.
  transfer_destinations text[] default '{}',
  price_per_hour   numeric(10,2) default 0,
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

-- ── Reviews ──────────────────────────────────────────────────
create table if not exists public.reviews (
  id         uuid primary key default uuid_generate_v4(),
  driver_id  uuid not null references public.drivers (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  rating     numeric(2,1) not null check (rating >= 1 and rating <= 5),
  comment    text not null,
  trip       text,
  created_at timestamptz not null default now()
);

create index if not exists reviews_driver_idx on public.reviews (driver_id);

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

-- L'enum d'origine ne couvrait pas tout le cycle de vie applicatif
-- (lib/bookings.ts) : on complète sans casser les bases existantes.
alter type booking_status add value if not exists 'refused';
alter type booking_status add value if not exists 'paid';

-- ── Messages (chat lié à une réservation) ────────────────────
-- Un fil par réservation : pas de messagerie libre, la conversation n'existe
-- que parce qu'une course existe. Voir lib/chat.ts pour la logique métier.
create table if not exists public.messages (
  id          uuid primary key default uuid_generate_v4(),
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  sender_id   uuid not null references public.profiles (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 1000),
  created_at  timestamptz not null default now()
);

create index if not exists messages_booking_created_idx
  on public.messages (booking_id, created_at);

-- Le fil est ouvert (écriture) uniquement quand la course est payée,
-- et archivé (lecture seule) une fois terminée ou annulée.
create or replace function public.booking_chat_is_open(bid uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.bookings b
    where b.id = bid
      and b.status = 'paid'
      and now() < coalesce(b.start_at, b.created_at) + interval '24 hours'
  );
$$;

create or replace function public.is_booking_participant(bid uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.bookings b
    where b.id = bid
      and (auth.uid() = b.client_id or auth.uid() = b.driver_id)
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- Trigger : créer un profil automatiquement à l'inscription
-- ─────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  meta       jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  -- Google (OIDC) sends given_name/family_name/name instead of our own keys.
  full_name  text  := coalesce(meta ->> 'full_name', meta ->> 'name', '');
begin
  insert into public.profiles (id, role, first_name, last_name, phone, avatar_url)
  values (
    new.id,
    coalesce((meta ->> 'role')::user_role, 'client'),
    coalesce(
      nullif(meta ->> 'first_name', ''),
      nullif(meta ->> 'given_name', ''),
      nullif(split_part(full_name, ' ', 1), ''),
      ''
    ),
    coalesce(
      nullif(meta ->> 'last_name', ''),
      nullif(meta ->> 'family_name', ''),
      nullif(substring(full_name from position(' ' in full_name) + 1), full_name),
      ''
    ),
    meta ->> 'phone',
    coalesce(nullif(meta ->> 'avatar_url', ''), nullif(meta ->> 'picture', ''))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────
alter table public.profiles      enable row level security;
alter table public.drivers       enable row level security;
alter table public.reviews       enable row level security;
alter table public.bookings      enable row level security;
alter table public.messages      enable row level security;

-- Profiles : lecture publique, écriture par le propriétaire
create policy "profiles_select" on public.profiles for select using (true);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- Drivers : lecture publique (annuaire), écriture par le chauffeur
create policy "drivers_select" on public.drivers for select using (true);
create policy "drivers_insert_own" on public.drivers for insert with check (auth.uid() = id);
create policy "drivers_update_own" on public.drivers for update using (auth.uid() = id);

-- Reviews : lecture publique, écriture par un utilisateur authentifié
create policy "reviews_select" on public.reviews for select using (true);
create policy "reviews_insert" on public.reviews for insert with check (auth.uid() = author_id);

-- Bookings : visibles par client et chauffeur concernés
create policy "bookings_select" on public.bookings
  for select using (auth.uid() = client_id or auth.uid() = driver_id);
create policy "bookings_insert" on public.bookings
  for insert with check (auth.uid() = client_id);
create policy "bookings_update_parties" on public.bookings
  for update using (auth.uid() = client_id or auth.uid() = driver_id);

-- Messages : lisibles par les deux parties de la course, écrivables seulement
-- tant que le fil est ouvert (course payée, non clôturée). L'historique reste
-- lisible après la course — archivé, jamais supprimé.
create policy "messages_select_parties" on public.messages
  for select using (public.is_booking_participant(booking_id));
create policy "messages_insert_open" on public.messages
  for insert with check (
    auth.uid() = sender_id
    and public.is_booking_participant(booking_id)
    and public.booking_chat_is_open(booking_id)
  );

-- ─────────────────────────────────────────────────────────────
-- Realtime : activer la diffusion sur drivers
-- ─────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.drivers;
-- Chat temps réel : les deux parties reçoivent les nouveaux messages en push.
-- (RLS s'applique aussi aux événements realtime.)
alter publication supabase_realtime add table public.messages;

-- ─────────────────────────────────────────────────────────────
-- RGPD : registre des consentements + journal d'audit
-- ─────────────────────────────────────────────────────────────
create table if not exists public.consents (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  version     int  not null,
  analytics   boolean not null default false,
  marketing   boolean not null default false,
  ip_hash     text,            -- IP hachée (preuve de consentement, minimisation)
  created_at  timestamptz not null default now()
);

create index if not exists consents_user_idx on public.consents (user_id, created_at desc);

-- Journal d'audit des actions sensibles (accès/effacement des données)
create table if not exists public.audit_log (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references public.profiles (id) on delete set null,
  action      text not null,   -- 'data_export' | 'account_delete' | 'consent_update'
  detail      jsonb,
  created_at  timestamptz not null default now()
);

alter table public.consents  enable row level security;
alter table public.audit_log enable row level security;

-- Un utilisateur ne voit / écrit que ses propres consentements.
create policy "consents_select_own" on public.consents
  for select using (auth.uid() = user_id);
create policy "consents_insert_own" on public.consents
  for insert with check (auth.uid() = user_id);

-- Le journal d'audit est en lecture seule pour le propriétaire ; l'écriture
-- se fait côté serveur (service role) uniquement.
create policy "audit_select_own" on public.audit_log
  for select using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- RGPD : effacement complet déclenché par l'utilisateur (RPC)
-- security definer → s'exécute avec les droits du créateur de la fonction,
-- mais n'agit QUE sur l'utilisateur authentifié appelant (auth.uid()).
-- ─────────────────────────────────────────────────────────────
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  -- Les suppressions en cascade nettoient profiles, drivers, messages, etc.
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Migration : back-office admin (/admin)
--
-- ⚠️ À exécuter EN DEUX TEMPS dans l'éditeur SQL Supabase.
--    Postgres refuse d'utiliser une valeur d'enum ajoutée dans la même
--    transaction : lancez le bloc 1 seul, puis le bloc 2.
-- ─────────────────────────────────────────────────────────────

-- ── BLOC 1 (à exécuter seul, puis attendre le succès) ────────
alter type user_role add value if not exists 'admin';

-- ── BLOC 2 ───────────────────────────────────────────────────
-- Statut de validation du dossier. Les clients sont 'approved' d'office ;
-- seuls les chauffeurs passent par la file d'attente.
alter table public.profiles
  add column if not exists status text not null default 'approved'
    check (status in ('pending', 'approved', 'rejected')),
  add column if not exists email text,
  add column if not exists approved_at timestamptz;

create index if not exists profiles_pending_drivers_idx
  on public.profiles (role, status);

-- Backfill : e-mails existants + chauffeurs déjà inscrits remis en attente.
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id and p.email is null;

update public.profiles
   set status = 'pending'
 where role = 'driver' and approved_at is null;

-- Le trigger d'inscription renseigne désormais l'e-mail et met les nouveaux
-- chauffeurs en attente de validation.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  meta       jsonb     := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  full_name  text      := coalesce(meta ->> 'full_name', meta ->> 'name', '');
  new_role   user_role := coalesce((meta ->> 'role')::user_role, 'client');
begin
  insert into public.profiles (id, role, first_name, last_name, phone, avatar_url, email, status)
  values (
    new.id,
    new_role,
    coalesce(
      nullif(meta ->> 'first_name', ''),
      nullif(meta ->> 'given_name', ''),
      nullif(split_part(full_name, ' ', 1), ''),
      ''
    ),
    coalesce(
      nullif(meta ->> 'last_name', ''),
      nullif(meta ->> 'family_name', ''),
      nullif(substring(full_name from position(' ' in full_name) + 1), full_name),
      ''
    ),
    meta ->> 'phone',
    coalesce(nullif(meta ->> 'avatar_url', ''), nullif(meta ->> 'picture', '')),
    new.email,
    case when new_role = 'driver' then 'pending' else 'approved' end
  );
  return new;
end;
$$;

-- Personne ne peut s'auto-promouvoir : `profiles_update_own` autorise l'écriture
-- sur sa propre ligne, on verrouille donc role/status au niveau du trigger.
create or replace function public.protect_privileged_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Le service role (back-office) court-circuite cette garde.
  if auth.uid() is not null and auth.uid() = new.id then
    new.role   := old.role;
    new.status := old.status;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_privileged on public.profiles;
create trigger profiles_protect_privileged
  before update on public.profiles
  for each row execute function public.protect_privileged_columns();

-- Promotion d'un compte en admin (à lancer manuellement, une seule fois) :
--   update public.profiles set role = 'admin' where id = '<uuid auth.users>';

