-- ─────────────────────────────────────────────────────────────
-- Messages du formulaire /contact — enregistrés en base
-- Rédigé le 2026-10-14. À lancer EN UN BLOC dans l'éditeur SQL du dashboard
-- (le jeton SUPABASE_ACCESS_TOKEN répond 401, apply-schema.ps1 ne passe pas).
--
-- POURQUOI
--    Jusqu'ici le message ne vivait que dans l'e-mail envoyé à l'équipe : un
--    envoi refusé par Resend, et il n'en restait rien. Comme pour
--    `quote_requests`, la base fait foi et l'e-mail n'est qu'une notification.
--
-- ⚠️ `create table` SANS `if not exists`, volontairement
--    Le 2026-10-02, un `if not exists` a laissé en place une `quote_requests`
--    créée hors du dépôt, avec d'autres colonnes, SANS AUCUNE ERREUR — et la
--    route répondait 500. Si une `contact_messages` existe déjà, cette
--    migration doit s'arrêter, pour qu'on regarde ce qu'elle contient.
--
-- ⚠️ `type` est un `text`, pas un enum ni une liste en `check`
--    La liste des types vit dans le code (`CONTACT_TYPES`,
--    lib/contactMessage.ts) et la route la valide. Un enum en base
--    refuserait un nouveau type entre le déploiement et la migration : le
--    piège déjà rencontré avec `driver_document_kind`.
--
-- RLS activée SANS AUCUNE POLICY : seul le service role (POST /api/contact)
-- écrit et lit. La table porte nom, e-mail et téléphone de particuliers
-- sans compte — ne pas ajouter de policy publique.
--
-- Conservation : CONTACT_RETENTION_MONTHS (12), annoncée sur
-- /legal/confidentialite, purgée par le bouton de la console
-- (POST /api/admin/quotes/purge).
-- ─────────────────────────────────────────────────────────────

begin;

create table public.contact_messages (
  id          uuid primary key default uuid_generate_v4(),
  first_name  text not null check (char_length(btrim(first_name)) between 1 and 60),
  last_name   text not null check (char_length(btrim(last_name)) between 1 and 60),
  email       text not null check (position('@' in email) > 1 and char_length(email) <= 160),
  phone       text check (phone is null or char_length(phone) <= 30),
  type        text not null check (char_length(type) <= 40),
  message     text not null check (char_length(btrim(message)) between 1 and 4000),
  emailed     boolean not null default false,
  handled_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index contact_messages_created_idx on public.contact_messages (created_at desc);

alter table public.contact_messages enable row level security;

commit;

-- PostgREST doit relire le schéma, sinon il ignore la nouvelle table.
notify pgrst, 'reload schema';
