# Promeut un compte existant au rôle `admin`.
#
#   powershell -File scripts/promote-admin.ps1 -Email moi@exemple.com
#
# Pourquoi un script et pas un bouton dans l'application : `profiles_update_own`
# autorise un utilisateur à écrire sur sa propre ligne, et le trigger
# `profiles_protect_privileged` verrouille donc `role` et `status` dès que
# `auth.uid() = profiles.id`. Personne ne peut s'auto-promouvoir depuis le site.
# La promotion passe forcément hors session — ici l'API Management, qui
# s'exécute sans auth.uid() et n'est donc pas bridée par le trigger.
#
# Le jeton est lu depuis SUPABASE_ACCESS_TOKEN et n'est jamais affiché.

param(
  [Parameter(Mandatory = $true)][string]$Email,
  [string]$Ref = "goayrdtgblpczbcojkaq",
  # Rétrograder un admin : -Role client
  [ValidateSet("admin", "client", "driver")][string]$Role = "admin"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Web.Extensions
$ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer

$token = $env:SUPABASE_ACCESS_TOKEN
if (-not $token) { $token = [Environment]::GetEnvironmentVariable("SUPABASE_ACCESS_TOKEN", "User") }
if (-not $token) { Write-Host "SUPABASE_ACCESS_TOKEN absent."; exit 1 }

$uri = "https://api.supabase.com/v1/projects/$Ref/database/query"
$headers = @{ Authorization = "Bearer $token" }

function Query([string]$sql) {
  $body = $ser.Serialize(@{ query = $sql })
  Invoke-RestMethod -Uri $uri -Method POST -Headers $headers -ContentType "application/json" `
    -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 90
}

# Guillemets simples doublés : seule échappatoire nécessaire en SQL.
$safe = $Email.Replace("'", "''")

$found = Query "select u.id, u.email from auth.users u where lower(u.email) = lower('$safe');"
if (-not $found) {
  Write-Host "Aucun compte pour $Email."
  Write-Host "  -> Inscrivez-vous d'abord sur /auth/register, puis relancez ce script."
  exit 1
}

$res = Query @"
update public.profiles
   set role = '$Role'
 where id = (select id from auth.users where lower(email) = lower('$safe'))
returning id, email, role, status;
"@

if (-not $res) {
  Write-Host "Le compte existe dans auth.users mais n'a pas de ligne dans profiles."
  Write-Host "  -> Le trigger on_auth_user_created n'a pas tourne : rejouer supabase/setup/3-policies-rgpd.sql."
  exit 1
}

foreach ($r in @($res)) {
  Write-Host "$($r.email) -> role=$($r.role), status=$($r.status)"
}
# requireAdmin() relit profiles.role a chaque requete : pas besoin de se
# reconnecter, la session en cours devient admin immediatement.
Write-Host "`nEffet immediat, sans reconnexion. Console : http://localhost:3000/admin"
