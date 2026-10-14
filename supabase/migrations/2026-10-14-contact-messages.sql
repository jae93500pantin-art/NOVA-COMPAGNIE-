-- ─────────────────────────────────────────────────────────────
-- Messages du formulaire /contact — table `contact_messages`
-- Rédigé le 2026-10-14. À lancer EN UN BLOC dans l'éditeur SQL du dashboard
-- (le jeton SUPABASE_ACCESS_TOKEN répond 401, apply-schema.ps1 ne passe pas).
--
-- CE QUI EXISTE DÉJÀ (relu en base le 2026-10-14, créé hors du dépôt)
--    contact_messages (id uuid, created_at timestamptz, name text,
--    email text, subject text, message text, handled_at timestamptz)
--    RLS activée, aucune policy : l'insertion anonyme répond 42501.
--    C'est la forme que POST /api/contact écrit :
--      name    = prénom + nom
--      subject = libellé du type de demande (CONTACT_TYPE_LABELS)
--
-- CE QUE CETTE MIGRATION AJOUTE
--    `phone` : le téléphone, facultatif dans le formulaire. Sans cette
--    colonne, la route réécrit la ligne sans lui (il reste dans l'e-mail).
--    Elle le conserve dès que la colonne existe, sans redéploiement.
--
-- Rejouable : `if not exists` est sans risque ici, il ne crée pas de table —
-- il ajoute une colonne, et ne masque donc aucune divergence de structure.
--
-- ⚠️ Ne pas ajouter de policy : la table porte nom, e-mail et téléphone de
-- particuliers sans compte. Seul le service role (la route) écrit.
-- Conservation : CONTACT_RETENTION_MONTHS (12), purgée par le bouton de la
-- console (POST /api/admin/quotes/purge).
-- ─────────────────────────────────────────────────────────────

begin;

alter table public.contact_messages
  add column if not exists phone text check (phone is null or char_length(phone) <= 30);

alter table public.contact_messages enable row level security;

create index if not exists contact_messages_created_idx
  on public.contact_messages (created_at desc);

commit;

-- PostgREST doit relire le schéma, sinon il ignore la nouvelle colonne.
notify pgrst, 'reload schema';
