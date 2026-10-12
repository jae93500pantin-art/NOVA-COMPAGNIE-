-- ─────────────────────────────────────────────────────────────
-- Demandes de devis — remplace une table `quote_requests` étrangère au dépôt
-- Rédigé le 2026-10-12.
--
-- CE QUI S'EST PASSÉ
--    La migration du 2026-10-02 crée `quote_requests` avec `create table if
--    not exists`. Une table du même nom existait déjà en base, créée hors du
--    dépôt, avec d'autres colonnes (customer_name, pickup_location,
--    pickup_datetime, passengers, status…). La création a donc été ignorée
--    SANS ERREUR, et `/api/quotes` échouait sur « Could not find the 'email'
--    column » : toute demande de devis répondait 500.
--
--    ⚠️ Cette table-là portait aussi un créneau (`pickup_datetime`) et un
--    `status` : la forme d'une réservation, que le statut d'annuaire interdit.
--
-- SÛRETÉ
--    Elle ne supprime la table que si elle est VIDE (0 ligne au 2026-10-12).
--    Sinon, elle s'arrête sur une erreur sans rien toucher.
-- ─────────────────────────────────────────────────────────────

begin;

do $$
begin
  if exists (select 1 from public.quote_requests limit 1) then
    raise exception 'quote_requests contient des lignes : export manuel requis avant remplacement';
  end if;
end $$;

drop table public.quote_requests cascade;

create table public.quote_requests (
  id          uuid primary key default uuid_generate_v4(),
  driver_id   uuid references public.drivers (id) on delete set null,
  driver_slug text,
  name        text not null check (char_length(btrim(name)) between 2 and 80),
  email       text not null check (position('@' in email) > 1),
  phone       text not null,
  trip        text not null check (char_length(btrim(trip)) between 3 and 200),
  details     text,
  handled_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index quote_requests_driver_idx  on public.quote_requests (driver_id);
create index quote_requests_created_idx on public.quote_requests (created_at desc);

-- ⚠️ RLS activée SANS AUCUNE POLICY : seul le service role (la route
-- /api/quotes) écrit. Voir la migration du 2026-10-02.
alter table public.quote_requests enable row level security;

commit;

-- PostgREST doit relire le schéma, sinon il garde les anciennes colonnes.
notify pgrst, 'reload schema';
