-- Forfaits transfert aéroport PAR AÉROPORT (CDG, Orly, Le Bourget) — 2026-11-19
--
-- Chaque chauffeur annonce, s'il le souhaite, un forfait distinct pour chaque
-- aéroport. Stocké en jsonb sur `profiles`, à côté de l'ancien forfait unique
-- `airport_flat_rate` (créé hors du dépôt le 2026-10-12) :
--   {"cdg": 95, "ory": 80, "lbg": 90}  — une clé absente = pas de forfait.
--
-- ⚠️ Ce sont les prix DU CHAUFFEUR. Nova n'en fixe aucun (statut d'annuaire,
-- règle 3) : aucune valeur par défaut, aucune copie d'un chauffeur à l'autre.
--
-- ⚠️ `profiles_update_own` laisse son propriétaire écrire la colonne par
-- PostgREST : les bornes (1–1 000 €) sont appliquées par la route ET à la
-- lecture (`readAirportFlatRates`), une valeur hors bornes s'y lit « non
-- communiqué ». La contrainte ci-dessous ne vérifie que la forme.
--
-- Rejouable. À lancer depuis l'éditeur SQL du dashboard Supabase.

alter table public.profiles
  add column if not exists airport_flat_rates jsonb;

alter table public.profiles
  drop constraint if exists profiles_airport_flat_rates_is_object;
alter table public.profiles
  add constraint profiles_airport_flat_rates_is_object
  check (airport_flat_rates is null or jsonb_typeof(airport_flat_rates) = 'object');

-- L'ancien forfait unique valait pour les trois aéroports : on le recopie,
-- puis on le vide pour qu'il ne serve plus de repli.
update public.profiles
   set airport_flat_rates = jsonb_build_object(
         'cdg', airport_flat_rate,
         'ory', airport_flat_rate,
         'lbg', airport_flat_rate),
       airport_flat_rate = null
 where airport_flat_rate is not null
   and airport_flat_rates is null;

-- PostgREST doit voir la nouvelle colonne sans attendre.
notify pgrst, 'reload schema';
