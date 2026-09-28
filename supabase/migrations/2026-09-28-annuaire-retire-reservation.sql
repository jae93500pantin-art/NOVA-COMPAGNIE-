-- ─────────────────────────────────────────────────────────────
-- Statut d'annuaire — retrait de la réservation et de l'encaissement
-- Rédigé le 2026-09-28.
--
-- ⚠️ À RELIRE ET À LANCER À LA MAIN. Ce fichier n'est PAS repris par
--    scripts/compose-schema.ps1 ni par scripts/apply-schema.ps1, et c'est
--    voulu : il contient des `drop table`. Un script qui rejoue
--    automatiquement une suppression de table finit un jour par la rejouer sur
--    une base qui, elle, avait des données.
--
-- CE QU'IL SUPPRIME, ET POURQUOI
--    Le site ne prend plus de réservation et n'encaisse plus les courses : le
--    client convient de la prestation et du paiement directement avec le
--    chauffeur. Les objets ci-dessous n'ont donc plus d'écrivain ni de lecteur
--    — le code correspondant a été retiré du dépôt (voir CLAUDE.md).
--
--    Les laisser en place n'est pas neutre : `bookings` et `messages` portent
--    des données personnelles (nom, e-mail, téléphone, itinéraires,
--    conversations). Des tables que plus rien n'alimente ni ne purge, mais que
--    la RLS expose encore, sont exactement ce que le RGPD appelle une
--    conservation sans finalité.
--
-- AVANT DE LANCER
--    Vérifier que ces tables sont bien vides, ou exporter ce qu'elles
--    contiennent. Au 2026-09-28 elles l'étaient toutes (0 ligne) :
--
--      select 'bookings' t, count(*) from public.bookings
--      union all select 'messages', count(*) from public.messages
--      union all select 'reviews',  count(*) from public.reviews
--      union all select 'payments', count(*) from public.payments;
-- ─────────────────────────────────────────────────────────────

begin;

-- ── 1. Publication temps réel ────────────────────────────────
-- Retirée d'abord : supprimer une table encore publiée laisse la publication
-- dans un état que Postgres refuse ensuite de modifier proprement.
do $$ begin
  alter publication supabase_realtime drop table public.messages;
exception when others then null; end $$;

do $$ begin
  alter publication supabase_realtime drop table public.bookings;
exception when others then null; end $$;

-- ── 2. Fonctions et déclencheurs ─────────────────────────────
-- `refresh_driver_rating` recalculait `drivers.rating` / `reviews_count` à
-- chaque avis. Sans avis, elle ne peut plus qu'écraser ces colonnes à zéro.
drop trigger if exists reviews_refresh_rating on public.reviews;
drop function if exists public.refresh_driver_rating() cascade;

drop trigger if exists messages_mask_contacts on public.messages;
drop function if exists public.messages_mask_contacts() cascade;
-- ⚠️ `mask_contact_details` masquait les coordonnées dans un message de
-- course. Plus de messagerie, plus de désintermédiation à empêcher.
drop function if exists public.mask_contact_details(text) cascade;

drop function if exists public.booking_chat_is_open(uuid) cascade;
drop function if exists public.is_booking_participant(uuid) cascade;
drop function if exists public.calculate_booking_price(
  vehicle_category, text, int, numeric, numeric, numeric
) cascade;

-- ── 3. Tables ────────────────────────────────────────────────
-- Ordre imposé par les clés étrangères : messages et reviews pointent sur
-- bookings, payments aussi.
drop table if exists public.messages cascade;
drop table if exists public.reviews cascade;
drop table if exists public.payments cascade;
drop table if exists public.bookings cascade;

-- `pricing_rules` portait les bandes tarifaires par gamme et les deux taux
-- (commission 15 %, frais client 5 %). La plateforme n'impose plus de tarif et
-- ne prélève plus rien : chaque chauffeur annonce son prix sur sa fiche.
drop table if exists public.pricing_rules cascade;

-- ── 4. Enums devenus inutiles ────────────────────────────────
-- ⚠️ Après les tables seulement : un type encore utilisé par une colonne ne
-- peut pas être supprimé, et l'erreur serait ici le signe qu'une table a
-- survécu au bloc précédent.
drop type if exists payment_status;
drop type if exists booking_status;

-- ── 5. Colonnes de l'annuaire qui n'ont plus de source ───────
-- `rating` valait 5.0 par défaut, `reviews_count` et `trips` 0, et plus rien
-- ne les alimentait. Les garder ferait afficher « 5,0 ★ · 0 avis » sur la fiche
-- d'un professionnel réel à la première personne qui les relirait — une note
-- inventée. Elles ont déjà quitté le type `Driver` côté application.
alter table public.drivers
  drop column if exists rating,
  drop column if exists reviews_count,
  drop column if exists trips;

commit;

-- ─────────────────────────────────────────────────────────────
-- CE QUI RESTE EN PLACE, DÉLIBÉRÉMENT
--
--   profiles · drivers · vehicles · driver_documents  → l'annuaire lui-même,
--     le dossier d'un chauffeur et son véhicule (la plaque sert à vérifier
--     l'immatriculation déclarée, elle n'est pas publiée).
--   consents · audit_log · delete_my_account()        → RGPD.
--   approve_driver() · driver_slug_from_name()        → validation d'un
--     chauffeur par un administrateur, inchangée.
--   refresh_cnaps_verified()                          → le badge « carte CNAPS
--     vérifiée » se recalcule depuis la pièce déposée.
-- ─────────────────────────────────────────────────────────────
