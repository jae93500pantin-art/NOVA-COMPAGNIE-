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

-- ── Reviews (avis certifiés) ─────────────────────────────────
-- Un avis n'existe que parce qu'une course a eu lieu : il est rattaché à une
-- réservation TERMINÉE, appartenant à son auteur, et une seule fois.
create table if not exists public.reviews (
  id         uuid primary key default uuid_generate_v4(),
  driver_id  uuid not null references public.drivers (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  -- La preuve que l'avis est authentique. `unique` = 1 course, 1 avis ;
  -- la contrainte est en base, pas seulement dans le code applicatif.
  booking_id uuid unique references public.bookings (id) on delete cascade,
  rating     numeric(2,1) not null check (rating >= 1 and rating <= 5),
  comment    text not null check (char_length(btrim(comment)) between 10 and 500),
  trip       text,
  created_at timestamptz not null default now()
);

create index if not exists reviews_driver_idx on public.reviews (driver_id);
create index if not exists reviews_author_idx on public.reviews (author_id);

alter table public.reviews enable row level security;

-- Lecture publique : les avis sont l'argument de vente de la fiche.
drop policy if exists reviews_read_all on public.reviews;
create policy reviews_read_all on public.reviews
  for select using (true);

/**
 * Écriture : la règle métier entière tient dans cette policy. Elle refait
 * exactement la vérification de app/api/reviews/[driverId] — auteur = client
 * de la réservation, réservation terminée, et chauffeur cohérent. Sans elle,
 * un client muni de son token pourrait poster en direct sur PostgREST.
 */
drop policy if exists reviews_insert_after_completed_ride on public.reviews;
create policy reviews_insert_after_completed_ride on public.reviews
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.bookings b
       where b.id = reviews.booking_id
         and b.client_id = auth.uid()
         and b.driver_id = reviews.driver_id
         and b.status = 'completed'
    )
  );

-- Un avis publié n'est pas réécrivable : pas de policy update/delete.

/**
 * La note du chauffeur est dérivée, jamais saisie. Recalculée à chaque
 * insertion/suppression pour que `drivers.rating` et `reviews_count` ne
 * puissent pas diverger de la table des avis.
 */
create or replace function public.refresh_driver_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.driver_id, old.driver_id);
begin
  update public.drivers d
     set rating = coalesce((
           select round(avg(r.rating)::numeric, 2)
             from public.reviews r where r.driver_id = target
         ), 5.0),
         reviews_count = (
           select count(*) from public.reviews r where r.driver_id = target
         )
   where d.id = target;
  return null;
end;
$$;

drop trigger if exists reviews_refresh_rating on public.reviews;
create trigger reviews_refresh_rating
  after insert or update or delete on public.reviews
  for each row execute function public.refresh_driver_rating();

-- Migration d'une base existante :
--   alter table public.reviews
--     add column if not exists booking_id uuid unique references public.bookings (id) on delete cascade;

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

-- Profiles : chacun ne lit que SA ligne, écriture par le propriétaire.
--
-- ⚠️ Cette policy était `using (true)`. Depuis que la migration back-office a
-- ajouté la colonne `email`, une lecture publique exposait l'adresse et le rôle
-- de TOUS les comptes à quiconque possède la clé anon — laquelle est publique
-- par conception, embarquée dans le bundle du navigateur.
--
-- Rien dans l'application n'a besoin d'une lecture publique des profils : le
-- back-office (/admin) lit avec le service role, qui contourne la RLS, et tous
-- les autres appels ne consultent que leur propre ligne. Un futur annuaire
-- public s'appuiera sur `drivers`, qui a déjà sa propre policy de lecture.
create policy "profiles_select" on public.profiles for select using (auth.uid() = id);
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


-- ─────────────────────────────────────────────────────────────
-- Lien compte chauffeur → profil public
--
-- L'annuaire (`lib/drivers.ts`) est encore constitué de données fixes : ses
-- chauffeurs n'ont pas de compte, et un compte chauffeur créé sur le site n'a
-- pas de fiche publique. `driver_slug` est le pont entre les deux, le temps que
-- l'annuaire passe en base.
--
-- Il est posé par un administrateur, jamais par l'intéressé : la garde
-- `profiles_protect_privileged` verrouille déjà role et status, on y ajoute
-- cette colonne — sans quoi n'importe quel chauffeur pourrait s'attribuer la
-- salle de réservations d'un autre.
-- ─────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists driver_slug text unique;

create or replace function public.protect_privileged_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Le service role (back-office) court-circuite cette garde.
  if auth.uid() is not null and auth.uid() = new.id then
    new.role        := old.role;
    new.status      := old.status;
    new.driver_slug := old.driver_slug;
  end if;
  return new;
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- BLOC 4 — Persistance des réservations, messages et avis
--
-- Les trois vivaient dans des brokers en mémoire : un redémarrage du process
-- les effaçait. Le schéma les prévoyait, mais trois écarts empêchaient de les
-- y écrire telles quelles.
--
-- 1. `bookings.driver_id` référence `public.drivers`, or l'annuaire est encore
--    constitué de données fixes (`lib/drivers.ts`) : la table est vide, donc
--    aucune clé étrangère ne peut tenir. On stocke le slug, exactement comme
--    `profiles.driver_slug` rattache déjà un compte chauffeur à sa fiche.
-- 2. La réservation applicative porte plus que la table : nom et e-mail du
--    client (les e-mails de confirmation en dépendent), unité de facturation,
--    destination de transfert, adresses.
-- 3. L'heure de prise en charge est saisie en heure LOCALE, sans fuseau
--    (« 2026-09-12T14:30 »). La convertir en timestamptz à l'écriture ferait
--    dériver l'affichage d'un fuseau à l'autre : on conserve la chaîne telle
--    quelle et `start_at` ne sert plus qu'au tri.
--
-- Migration additive et rejouable : rien n'est supprimé, les colonnes
-- d'origine deviennent seulement facultatives.
-- ─────────────────────────────────────────────────────────────

alter table public.bookings
  add column if not exists driver_slug  text,
  add column if not exists client_name  text not null default '',
  add column if not exists client_email text not null default '',
  add column if not exists unit         text not null default 'hour',
  add column if not exists transfer     text,
  add column if not exists pickup       text not null default '',
  add column if not exists dropoff      text not null default '',
  add column if not exists when_local   text not null default '';

alter table public.bookings alter column driver_id drop not null;
alter table public.bookings alter column start_at  drop not null;

do $$ begin
  alter table public.bookings add constraint bookings_unit_known
    check (unit in ('hour', 'day', 'transfer'));
exception when duplicate_object then null; end $$;

-- Les deux lectures de l'application : la salle d'un chauffeur, l'historique
-- d'un client. Toutes deux du plus récent au plus ancien.
create index if not exists bookings_driver_slug_idx
  on public.bookings (driver_slug, created_at desc);
create index if not exists bookings_client_idx
  on public.bookings (client_id, created_at desc);

-- ── Messages : qui parle, et sous quel nom ───────────────────
-- `sender_id` est le compte auteur. Le rôle est stocké à part parce que
-- l'interface n'affiche pas un compte mais une PARTIE de la course : côté
-- chauffeur, la bulle porte le nom de la fiche publique, pas celui du compte.
alter table public.messages
  add column if not exists sender_role text not null default 'client',
  add column if not exists sender_name text not null default '';

do $$ begin
  alter table public.messages add constraint messages_sender_role_known
    check (sender_role in ('client', 'driver'));
exception when duplicate_object then null; end $$;

-- ── Avis : même pont vers l'annuaire en dur ──────────────────
alter table public.reviews
  add column if not exists driver_slug text,
  add column if not exists author_name text not null default '';

alter table public.reviews alter column driver_id drop not null;

create index if not exists reviews_driver_slug_idx
  on public.reviews (driver_slug, created_at desc);

/**
 * `refresh_driver_rating()` met à jour `public.drivers`, qui est vide tant que
 * l'annuaire n'est pas migré : le trigger ne trouve alors aucune ligne et ne
 * fait rien. On le rend explicitement tolérant à un `driver_id` nul plutôt que
 * de le laisser dépendre du hasard d'un `update` sans correspondance.
 */
create or replace function public.refresh_driver_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.driver_id, old.driver_id);
begin
  if target is null then return null; end if;
  update public.drivers d
     set rating = coalesce((
           select round(avg(r.rating)::numeric, 2)
             from public.reviews r where r.driver_id = target
         ), 5.0),
         reviews_count = (
           select count(*) from public.reviews r where r.driver_id = target
         )
   where d.id = target;
  return null;
end;
$$;

/**
 * RLS : l'API est le seul auteur.
 *
 * Les routes vérifient déjà l'identité (session) puis la légitimité
 * (`bookingActor`/`canActOn`, `canReviewBooking`) et écrivent avec le service
 * role, qui contourne la RLS — comme le back-office. Les policies d'écriture
 * destinées à un jeton utilisateur sont donc retirées : elles ne protégeaient
 * rien de plus et laissaient une seconde porte, directement sur PostgREST,
 * qui ne passait par aucune de ces règles.
 *
 * La LECTURE reste ouverte aux parties, pour qu'un futur accès direct (ou un
 * export RGPD) n'ait pas besoin du service role. Un chauffeur est reconnu par
 * le slug porté par son profil, seul lien disponible vers l'annuaire en dur.
 */
drop policy if exists "bookings_select"         on public.bookings;
drop policy if exists "bookings_insert"         on public.bookings;
drop policy if exists "bookings_update_parties" on public.bookings;
create policy "bookings_select" on public.bookings for select using (
  auth.uid() = client_id
  or exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and p.driver_slug is not null
       and p.driver_slug = bookings.driver_slug
  )
);

drop policy if exists "messages_select_parties" on public.messages;
drop policy if exists "messages_insert_open"    on public.messages;
create policy "messages_select_parties" on public.messages for select using (
  exists (
    select 1 from public.bookings b
     where b.id = messages.booking_id
       and (
         b.client_id = auth.uid()
         or exists (
           select 1 from public.profiles p
            where p.id = auth.uid()
              and p.driver_slug is not null
              and p.driver_slug = b.driver_slug
         )
       )
  )
);

-- Les avis restent en lecture publique : ils sont l'argument de la fiche.
drop policy if exists "reviews_insert" on public.reviews;
drop policy if exists reviews_insert_after_completed_ride on public.reviews;
