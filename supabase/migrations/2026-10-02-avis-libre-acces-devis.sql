-- ─────────────────────────────────────────────────────────────
-- Libre accès à l'annuaire · avis de compte · demandes de devis
-- Rédigé le 2026-10-02.
--
-- ⚠️ À LANCER EN UN SEUL BLOC, mais APRÈS la migration
--    2026-09-29-verification-pieces.sql (blocs A puis B).
--    Aucune valeur d'enum n'est ajoutée ici, donc pas de découpage.
--
-- POURQUOI
--    1. L'annuaire doit être consultable sans compte, et il l'est déjà
--       (`drivers_select using (true)`, middleware qui ne garde que /compte
--       et /admin). Ce fichier n'y touche pas — il le VÉRIFIE, et corrige ce
--       qui empêchait réellement d'écrire.
--    2. Les avis : la policy d'insertion exigeait une RÉSERVATION TERMINÉE.
--       La réservation a été retirée (statut d'annuaire), donc plus aucun avis
--       ne pouvait être inséré — la règle ne protégeait plus rien, elle
--       interdisait tout.
--    3. Les demandes de devis n'avaient aucune table : le formulaire de
--       contact existant simule son envoi et perd le message.
-- ─────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════
-- 1. Lecture publique de l'annuaire — vérification, pas changement
-- ═════════════════════════════════════════════════════════════
--
-- `drivers_select` est déjà `using (true)`, et les tarifs sont des colonnes de
-- cette même table, donc couverts par la même policy. On la rejoue pour que ce
-- fichier soit autoportant sur une base fraîche.
--
-- ⚠️ CE N'EST PAS CE QUI REND L'ANNUAIRE PUBLIC CÔTÉ SITE. Le statut de
--    validation vit dans `profiles`, que la RLS réserve à son propriétaire :
--    une lecture anon sur `drivers` seule publierait les chauffeurs EN ATTENTE
--    de validation. C'est pourquoi `lib/driverDirectory.ts` lit avec le service
--    role et filtre sur `profiles.status = 'approved'`. Ne pas « simplifier »
--    en basculant le site sur la clé anon : ce serait publier des dossiers non
--    vérifiés.

drop policy if exists "drivers_select" on public.drivers;
create policy "drivers_select" on public.drivers for select using (true);


-- ═════════════════════════════════════════════════════════════
-- 2. Avis : l'auteur est un compte client, plus une course
-- ═════════════════════════════════════════════════════════════

-- ⚠️ `booking_id` devient sans objet. On NE SUPPRIME PAS la colonne : des avis
--    historiques peuvent la porter, et c'est la seule trace qu'ils étaient,
--    eux, rattachés à une course réelle. Elle est déjà nullable, et `unique`
--    admet plusieurs NULL en Postgres — rien à changer.
--    En revanche la contrainte d'unicité utile change de clé : un auteur, un
--    avis par chauffeur.
alter table public.reviews
  add column if not exists author_name text;

-- ⚠️ `updated_at` est posé à `created_at` et NON à `now()` pour les lignes
--    existantes : avec `now()`, tout avis déjà publié s'afficherait « modifié »
--    le jour de la migration. `wasEdited()` compare les deux dates.
alter table public.reviews
  add column if not exists updated_at timestamptz;
update public.reviews set updated_at = created_at where updated_at is null;
alter table public.reviews
  alter column updated_at set default now();

-- ⚠️ Nettoyage AVANT la contrainte : un index unique sur des doublons
--    existants échouerait, et le message de Postgres ne dirait pas lesquels.
--    Il n'y a aucune donnée aujourd'hui (plus de réservation, donc plus
--    d'insertion possible depuis le 2026-09-28), mais une base de test peut
--    en porter.
delete from public.reviews r
 where r.author_id is not null
   and r.ctid <> (
     select min(r2.ctid) from public.reviews r2
      where r2.driver_id = r.driver_id and r2.author_id = r.author_id
   );

create unique index if not exists reviews_one_per_author_driver
  on public.reviews (driver_id, author_id)
  where author_id is not null;

/**
 * ⚠️ LES POLICIES D'ÉCRITURE SONT RETIRÉES, PAS REMPLACÉES.
 *
 * `reviews_insert_after_completed_ride` exigeait une réservation terminée :
 * elle bloquait 100 % des insertions depuis le retrait de la réservation.
 * `reviews_insert` (bloc 3 historique) autorisait, lui, tout titulaire d'un
 * jeton à écrire `author_id = auth.uid()` — donc sans vérifier le RÔLE, sans
 * limiter le nombre d'avis et sans passer par aucune règle applicative.
 *
 * On ne les remplace pas par une policy permissive : ce serait une SECONDE
 * PORTE, directement sur PostgREST, contournant `/api/reviews/[driverId]` qui
 * vérifie la session, lit le rôle dans `profiles` et limite la cadence. C'est
 * le même parti pris que la persistance (voir CLAUDE.md § Persistance) : la
 * route fait autorité et écrit avec le service role, qui ignore la RLS.
 *
 * Conséquence assumée : aucune écriture possible avec la clé anon. C'est le
 * but.
 */
drop policy if exists reviews_insert_after_completed_ride on public.reviews;
drop policy if exists reviews_insert on public.reviews;

/**
 * ⚠️ PAS DE POLICY D'UPDATE NI DE DELETE NON PLUS — alors que modifier et
 *    supprimer son propre avis EST une fonctionnalité du site.
 *
 * Elle passe par `PATCH` / `DELETE` sur `/api/reviews/[driverId]`. Une policy
 * `for update to authenticated using (auth.uid() = author_id)` paraît
 * équivalente et ne l'est pas : par PostgREST, elle laisserait un auteur
 * réécrire son `rating` **sans repasser par aucune validation** — commentaire
 * d'un caractère, note fractionnaire, aucune limite de cadence — et toucher à
 * `author_name`, `driver_id` ou `created_at`, qu'aucun formulaire n'expose.
 * Postgres ne sait pas restreindre un UPDATE à certaines colonnes dans une
 * policy.
 */
drop policy if exists reviews_update_own on public.reviews;
drop policy if exists reviews_delete_own on public.reviews;

-- La lecture reste publique : un avis non lu ne sert à personne.
drop policy if exists reviews_read_all on public.reviews;
drop policy if exists reviews_select on public.reviews;
create policy reviews_read_all on public.reviews for select using (true);


-- ═════════════════════════════════════════════════════════════
-- 3. Demandes de devis
-- ═════════════════════════════════════════════════════════════
/**
 * Une demande de devis transmise à un chauffeur référencé.
 *
 * ⚠️ `driver_id` est `on delete set null` et NON `cascade` : la demande d'un
 * visiteur ne doit pas disparaître parce que le chauffeur a quitté la
 * plateforme — c'est elle qui prouve qu'une mise en relation a été demandée,
 * et le visiteur peut réclamer une réponse.
 *
 * ⚠️ AUCUN MONTANT dans cette table. Pas de colonne `price`, `amount` ni
 * `quote`. Nova transmet une demande, le chauffeur chiffre et facture : une
 * colonne de prix ici serait le premier pas vers un prix imposé (règle 3 du
 * statut d'annuaire) et vers la vente de la prestation.
 */
create table if not exists public.quote_requests (
  id          uuid primary key default uuid_generate_v4(),
  driver_id   uuid references public.drivers (id) on delete set null,
  -- Le slug est conservé en clair : il survit à la suppression du chauffeur et
  -- reste lisible dans la console alors que l'uuid ne désigne plus rien.
  driver_slug text,
  name        text not null check (char_length(btrim(name)) between 2 and 80),
  email       text not null check (position('@' in email) > 1),
  phone       text not null,
  trip        text not null check (char_length(btrim(trip)) between 3 and 200),
  details     text,
  -- Utile au support : savoir si la demande a été relayée.
  handled_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists quote_requests_driver_idx
  on public.quote_requests (driver_id);
create index if not exists quote_requests_created_idx
  on public.quote_requests (created_at desc);

alter table public.quote_requests enable row level security;

/**
 * ⚠️ AUCUNE POLICY, ET C'EST LA PROTECTION.
 *
 * RLS activée sans policy = personne ne lit ni n'écrit avec la clé anon ou un
 * jeton utilisateur. Seul le service role passe, donc seule la route
 * `/api/quotes` écrit, et seule la console admin lira.
 *
 * ⚠️ Ne PAS ajouter une policy d'insertion publique pour « simplifier » le
 * formulaire. Cette table porte le nom, l'e-mail et le téléphone de
 * particuliers : une policy `for insert using (true)` ouvrirait l'écriture
 * directe sur PostgREST (donc le remplissage automatisé), et il n'existe
 * aucune policy de lecture par colonne pour limiter ce qu'on en ressort.
 */
