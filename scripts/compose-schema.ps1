# Recompose supabase/schema.sql en trois blocs exécutables dans l'ordre.
#
# schema.sql est la source de vérité du CONTENU, mais son ordre de lecture
# n'est pas un ordre d'exécution valide sur une base vierge :
#   1. `reviews` référence `public.bookings` avant sa création ;
#   2. `booking_chat_is_open()` emploie la valeur d'enum 'paid' ajoutée plus
#      haut — Postgres refuse d'utiliser une valeur d'enum dans la transaction
#      qui l'ajoute ;
#   3. les `create policy` et `alter publication` ne sont pas rejouables.
#
# Ce script réordonne, isole les `alter type ... add value` dans leur propre
# fichier, et rend le bloc final idempotent.
#
# Les sections sont repérées par leurs commentaires-marqueurs, jamais par
# numéro de ligne : éditer schema.sql ne casse donc pas la composition.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$src  = Join-Path $root "supabase\schema.sql"
$dir  = Join-Path $root "supabase\setup"
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }

$a = Get-Content $src -Encoding UTF8

function Find-Marker([string]$pattern, [string]$label) {
  for ($i = 0; $i -lt $a.Length; $i++) { if ($a[$i] -match $pattern) { return $i } }
  throw "Marqueur introuvable dans schema.sql : $label ($pattern)"
}

$iReviews   = Find-Marker '^-- .. Reviews \(avis'          "section Reviews"
$iBookings  = Find-Marker '^-- .. Bookings'                "section Bookings"
$iEnumAdd   = Find-Marker "^-- L'enum d'origine"           "ajout enum booking_status"
$iMessages  = Find-Marker '^-- .. Messages \(chat'         "section Messages"
$iAdminHdr  = Find-Marker '^-- Migration : back-office'    "en-tete migration admin"
$iEnumAdmin = Find-Marker "^alter type user_role add value" "ajout enum user_role"
$iBloc2     = Find-Marker '^-- .. BLOC 2'                  "BLOC 2 migration admin"

# L'en-tête de la migration admin est précédé d'une ligne de séparation ; on
# remonte jusqu'à elle pour ne pas la laisser orpheline en fin de bloc 3.
$iAdminSep = $iAdminHdr
while ($iAdminSep -gt 0 -and $a[$iAdminSep - 1] -match '^-- .{5,}$') { $iAdminSep-- }

$base     = $a[0..($iReviews - 1)]
$reviews  = $a[$iReviews..($iBookings - 1)]
$bookings = $a[$iBookings..($iEnumAdd - 1)]
$enumAdd  = $a[$iEnumAdd..($iMessages - 1)]
$rest     = $a[$iMessages..($iAdminSep - 1)]
$adminMig = $a[$iBloc2..($a.Length - 1)]

# `alter publication ... add table` échoue si la table y est déjà publiée.
$rest = $rest | ForEach-Object {
  if ($_ -match '^alter publication supabase_realtime add table (.+);\s*$') {
    "do `$`$ begin alter publication supabase_realtime add table $($Matches[1]);" +
    " exception when duplicate_object then null; end `$`$;"
  } else { $_ }
}

# ── Bloc 1 : tables, dans un ordre de dépendances valide ─────────────────
@(
  "-- ETAPE 1/3 - Tables de base (extensions, enums, profiles, drivers, bookings).",
  "-- Genere par scripts/compose-schema.ps1 depuis supabase/schema.sql.",
  "-- Ne pas editer ici : toute modification se fait dans schema.sql.",
  "--",
  "-- bookings est cree AVANT reviews, qui le reference par booking_id.",
  ""
) + $base + $bookings | Set-Content (Join-Path $dir "1-tables.sql") -Encoding UTF8

# ── Bloc 2 : valeurs d'enum, seules dans leur transaction ────────────────
@(
  "-- ETAPE 2/3 - Ajout des valeurs d'enum.",
  "-- A LANCER SEUL. Postgres refuse d'utiliser une valeur d'enum dans la",
  "-- transaction qui l'ajoute : 'paid' est employe par booking_chat_is_open()",
  "-- a l'etape 3, et 'admin' par le back-office.",
  ""
) + $enumAdd + @("", $a[$iEnumAdmin]) | Set-Content (Join-Path $dir "2-enums.sql") -Encoding UTF8

# ── Bloc 3 : tout ce qui dépend des tables et des nouvelles valeurs ──────
# Les policies de schema.sql sont écrites sans `drop policy if exists` ; on les
# supprime d'abord pour que le bloc soit rejouable. `execute` dans un bloc DO
# car les tables visées peuvent ne pas exister au tout premier passage.
$policies = @(
  "profiles_select on public.profiles",
  "profiles_update_own on public.profiles",
  "drivers_select on public.drivers",
  "drivers_insert_own on public.drivers",
  "drivers_update_own on public.drivers",
  "reviews_select on public.reviews",
  "reviews_insert on public.reviews",
  "bookings_select on public.bookings",
  "bookings_insert on public.bookings",
  "bookings_update_parties on public.bookings",
  "messages_select_parties on public.messages",
  "messages_insert_open on public.messages",
  "consents_select_own on public.consents",
  "consents_insert_own on public.consents",
  "audit_select_own on public.audit_log"
)
$prelude = @(
  "-- Idempotence : `create policy` n'accepte pas `if not exists`.",
  "do `$`$ begin"
) + ($policies | ForEach-Object { "  execute 'drop policy if exists $_';" }) + @(
  "exception when undefined_table then null; end `$`$;",
  ""
)

@(
  "-- ETAPE 3/3 - Avis, messagerie, trigger d'inscription, RLS, realtime, RGPD,",
  "-- migration back-office. A lancer APRES le succes de l'etape 2.",
  "-- Rejouable sans effet de bord.",
  ""
) + $prelude + $reviews + $rest + $adminMig |
  Set-Content (Join-Path $dir "3-policies-rgpd.sql") -Encoding UTF8

Get-ChildItem $dir | ForEach-Object { "  $($_.Name)  ($((Get-Content $_.FullName).Length) lignes)" }
