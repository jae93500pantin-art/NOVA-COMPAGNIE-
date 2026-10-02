-- ─────────────────────────────────────────────────────────────
-- Vérification des pièces justificatives par un administrateur
-- Rédigé le 2026-09-29.
--
-- ⚠️ À LANCER EN DEUX TEMPS, dans cet ordre, depuis l'éditeur SQL Supabase.
--    Postgres refuse d'employer une valeur d'enum dans la transaction qui
--    l'ajoute : le bloc A doit être **validé** avant que le bloc B ne s'exécute.
--    C'est la même contrainte que `supabase/setup/2-enums.sql`.
--
-- POURQUOI CE BLOC EXISTE
--    La page Transfert Aéroport affiche « contrôlés sur pièces ». Jusqu'ici
--    c'était faux : `/admin` offrait un bouton « Valider » sans qu'aucun écran
--    ne permette de REGARDER le permis, la carte VTC ou l'assurance. Un badge
--    de vérification qu'on ne peut pas honorer est une publicité trompeuse, et
--    en cas d'incident avec un faux chauffeur, c'est la plateforme qui répond.
-- ─────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════
-- BLOC A — valeurs d'enum (À EXÉCUTER SEUL, PUIS VALIDER)
-- ═════════════════════════════════════════════════════════════
--
-- Deux pièces manquaient au contrôle annoncé :
--   • `vtc_register` — justificatif d'inscription au registre des exploitants
--     VTC. La carte professionnelle atteste du CHAUFFEUR ; le registre atteste
--     de l'EXPLOITANT. Un chauffeur peut détenir une carte valide sans que son
--     entreprise soit inscrite — c'est précisément ce qu'on doit pouvoir voir.
--   • `kbis` — Kbis ou avis de situation SIRENE, qui rattache le SIREN déclaré
--     à une entreprise réellement immatriculée.

-- ⚠️ Le type s'appelle bien `driver_document_kind`. Ni `document_type`, ni
--    `driver_document_type` : ces deux noms n'existent pas, et un ALTER qui
--    les viserait échouerait sur « type does not exist » — sans que rien
--    n'indique que c'est le nom, et non la valeur, qui est en cause.

alter type driver_document_kind add value if not exists 'vtc_register';
alter type driver_document_kind add value if not exists 'kbis';

-- ⚠️ CE BLOC NE BLOQUE PLUS L'INSCRIPTION D'UN CHAUFFEUR.
--    Il l'a bloquée : `vtc_register` et `kbis` sont devenus obligatoires côté
--    code avant que l'enum ne les connaisse, et l'étape 3 du tunnel devenait
--    infranchissable — chaque dépôt répondait 500, et la porte réclamait une
--    pièce qu'aucun fichier ne pouvait satisfaire.
--    `lib/documentSupport.ts` lit désormais l'enum réellement en place et le
--    code s'y conforme : les deux pièces sont montrées « bientôt », ne sont
--    pas exigées, et redeviennent obligatoires **d'elles-mêmes** dès que ce
--    bloc est validé. Rien à redéployer après.


-- ═════════════════════════════════════════════════════════════
-- BLOC B — colonnes de contrôle (après validation du bloc A)
-- ═════════════════════════════════════════════════════════════

-- ── Décision de l'administrateur, pièce par pièce ────────────
/**
 * ⚠️ `checked_ok` est distinct de `status`.
 *
 * `status` décrit le cycle de la pièce ('pending' → 'approved' / 'rejected') et
 * se remet à 'pending' dès qu'un fichier est redéposé. `checked_ok` est la case
 * « Conforme » que l'administrateur coche APRÈS avoir regardé le document : le
 * bouton « Valider le chauffeur » s'appuie sur elle, pas sur la présence du
 * fichier. Sans cette distinction, déposer un fichier vide suffirait à passer.
 *
 * ⚠️ Elle est remise à `false` par le trigger ci-dessous dès qu'un fichier est
 * remplacé : autrement, faire valider une pièce propre puis la remplacer
 * donnerait un dossier « conforme » portant un autre document.
 */
alter table public.driver_documents
  add column if not exists checked_ok  boolean not null default false,
  -- Échéance saisie par l'administrateur (assurance, carte VTC…). `date` et
  -- non `timestamptz` : une attestation expire un jour, pas à une seconde.
  add column if not exists expires_at  date,
  add column if not exists checked_by  uuid references public.profiles (id) on delete set null,
  add column if not exists checked_at  timestamptz,
  -- Trace du rappel « expire dans 30 jours », pour ne pas le renvoyer chaque
  -- jour pendant un mois.
  add column if not exists expiry_notified_at timestamptz;

-- ── Refus d'un dossier ───────────────────────────────────────
/**
 * Le refus vit sur le profil, pas sur une pièce : c'est une décision sur le
 * DOSSIER, même quand une seule pièce la motive. Le chauffeur redépose, et son
 * statut repasse en attente — d'où `rejected_at` remis à null par le trigger.
 */
alter table public.profiles
  add column if not exists rejection_reason text,
  add column if not exists rejected_at      timestamptz;

-- ⚠️ `status` de `profiles` accepte-t-il 'rejected' ? La contrainte d'origine
-- ne connaissait que pending/approved/suspended. On l'élargit plutôt que de
-- détourner 'suspended', qui désigne un compte fermé après coup — pas un
-- dossier jamais accepté.
-- ⚠️ PAS de `exception when others then null` ici, contrairement au reste du
--    fichier. Avaler l'erreur laisserait l'ancienne contrainte en place, et le
--    refus d'un dossier échouerait alors en PRODUCTION sur une violation de
--    contrainte — une panne découverte au premier refus, loin de sa cause.
--    Mieux vaut que ce bloc échoue ici, sous les yeux, dans l'éditeur SQL.
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status in ('pending', 'approved', 'suspended', 'rejected'));

-- ── Redéposer une pièce annule son contrôle ──────────────────
/**
 * ⚠️ Le garde-fou le moins visible de ce bloc.
 *
 * Sans lui : l'administrateur coche « Conforme » sur une assurance valide, le
 * chauffeur redépose un autre fichier au même emplacement, et le dossier reste
 * marqué conforme avec un document que personne n'a vu. Le contrôle porte sur
 * un fichier précis — changer le fichier annule le contrôle.
 */
create or replace function public.driver_documents_reset_review()
returns trigger
language plpgsql
as $$
begin
  if new.storage_path is distinct from old.storage_path then
    new.checked_ok  := false;
    new.checked_by  := null;
    new.checked_at  := null;
    new.status      := 'pending';
    new.expiry_notified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists driver_documents_reset_review on public.driver_documents;
create trigger driver_documents_reset_review
  before update of storage_path on public.driver_documents
  for each row execute function public.driver_documents_reset_review();

-- ── Index de rappel d'échéance ───────────────────────────────
-- Sert la requête « quelles pièces expirent dans moins de 30 jours et n'ont pas
-- encore été signalées ? ».
create index if not exists driver_documents_expiry_idx
  on public.driver_documents (expires_at)
  where expires_at is not null;

-- ── Journal des décisions ────────────────────────────────────
/**
 * Réutilise `audit_log` (bloc RGPD) plutôt que d'ouvrir une seconde table :
 * `action` y est un texte libre et `detail` un jsonb. Les actions écrites par
 * cette fonctionnalité :
 *
 *   driver_documents_viewed  { driver_id, kinds[] }   — à l'ouverture de la fiche
 *   driver_document_checked  { driver_id, kind, checked_ok, expires_at }
 *   driver_approved          { driver_id, slug, documents[] }
 *   driver_rejected          { driver_id, reason, note }
 *
 * ⚠️ `user_id` porte l'ADMINISTRATEUR qui agit, pas le chauffeur concerné —
 * celui-ci est dans `detail.driver_id`. C'est la question à laquelle ce journal
 * doit répondre en cas de litige : qui a validé, et sur quelles pièces.
 */
create index if not exists audit_log_action_idx on public.audit_log (action, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- APRÈS APPLICATION
--   `npm run check:auth` ne couvre pas ce bloc. Pour vérifier :
--     select column_name from information_schema.columns
--      where table_name = 'driver_documents' and column_name in
--            ('checked_ok','expires_at','checked_by','checked_at');
--   Doit rendre 4 lignes.
-- ─────────────────────────────────────────────────────────────
