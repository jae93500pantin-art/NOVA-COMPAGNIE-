-- ─────────────────────────────────────────────────────────────
-- drivers.response_time : retirer la valeur par défaut « ≈ 5 min »
-- Rédigé le 2026-10-14. À lancer EN UN BLOC dans l'éditeur SQL du dashboard.
--
-- POURQUOI
--    La colonne valait « ≈ 5 min » par défaut, et aucun écran ne la fait
--    remplir au chauffeur. Chaque fiche publiait donc un délai de réponse
--    que personne n'avait déclaré — une promesse inventée au nom d'un
--    professionnel réel (même piège que `drivers.rating` à 5.0).
--
--    Le code l'écarte déjà à la lecture (`declaredResponseTime`,
--    lib/driverDirectory.ts) : cette migration remet la base en accord, pour
--    qu'aucun autre lecteur ne la reprenne.
--
-- Rejouable : sans effet une seconde fois.
-- ─────────────────────────────────────────────────────────────

begin;

alter table public.drivers alter column response_time drop default;

update public.drivers
   set response_time = null
 where response_time = '≈ 5 min';

commit;
