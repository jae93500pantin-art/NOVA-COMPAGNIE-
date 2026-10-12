-- ─────────────────────────────────────────────────────────────
-- Correctifs constatés sur la base réelle le 2026-10-12
--
-- Le SQL exécuté sur la base ne correspondait pas aux fichiers du dépôt. Trois
-- écarts, vérifiés par de vraies requêtes :
--
--   1. ⚠️ `quote_requests` acceptait une INSERTION AVEC LA CLÉ ANON (201).
--      La clé anon est publique (embarquée dans le site) : n'importe qui
--      pouvait remplir la table par PostgREST sans passer par /api/quotes,
--      donc sans validation ni limite de cadence. La table porte nom, e-mail
--      et téléphone de particuliers.
--   2. `quote_requests.details` était NOT NULL : une demande sans précisions
--      (champ facultatif du formulaire) répondait 500.
--   3. `driver_document_kind` n'avait ni `vtc_register` ni `kbis` : les deux
--      pièces obligatoires restaient indéposables.
--
-- ⚠️ DEUX TEMPS, comme la migration du 2026-09-29 : Postgres refuse d'utiliser
--    une valeur d'enum dans la transaction qui l'ajoute.
-- ─────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════
-- PARTIE A — valeurs d'enum (À EXÉCUTER SEULE)
-- ═════════════════════════════════════════════════════════════

alter type driver_document_kind add value if not exists 'vtc_register';
alter type driver_document_kind add value if not exists 'kbis';


-- ═════════════════════════════════════════════════════════════
-- PARTIE B — quote_requests (après la partie A)
-- ═════════════════════════════════════════════════════════════

begin;

-- RLS activée et AUCUNE policy : seul le service role (/api/quotes) écrit.
alter table public.quote_requests enable row level security;

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'quote_requests'
  loop
    execute format('drop policy %I on public.quote_requests', p.policyname);
  end loop;
end $$;

-- Ceinture en plus des bretelles : même si une policy revenait, les rôles
-- publics n'ont aucun droit sur la table.
revoke all on public.quote_requests from anon, authenticated;

alter table public.quote_requests alter column details drop not null;

commit;

notify pgrst, 'reload schema';
